import shutil,subprocess,threading,socketserver,tempfile,pathlib,os,time,json,secrets,email
from email import policy
import urllib.request,urllib.error
class Response:
 def __init__(self,r): self.status_code=r.status;self.content=r.read();self.text=self.content.decode('utf-8',errors='replace')
class Requests:
 ConnectionError=urllib.error.URLError
 def get(self,url,timeout=30): return self.send(url,None,{},timeout)
 def send(self,url,body,headers,timeout):
  try: return Response(urllib.request.urlopen(urllib.request.Request(url,data=body,headers=headers),timeout=timeout))
  except urllib.error.HTTPError as e: return Response(e)
 def post(self,url,data,files,headers,timeout):
  boundary='test'+secrets.token_hex(12);parts=[]
  for k,v in data.items(): parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
  for k,(name,blob) in files.items():
   parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"; filename="{name}"\r\nContent-Type: image/jpeg\r\n\r\n'.encode()+blob+b'\r\n')
  parts.append(f'--{boundary}--\r\n'.encode());headers['Content-Type']='multipart/form-data; boundary='+boundary
  return self.send(url,b''.join(parts),headers,timeout)
requests=Requests()
repo=pathlib.Path(__file__).resolve().parents[1]
php=os.environ.get('PHP_BINARY') or shutil.which('php')
if not php: raise SystemExit('Install PHP 8.1+ or set PHP_BINARY')
root=pathlib.Path(tempfile.mkdtemp(prefix='order-test-'))
messages=[]
class SMTP(socketserver.StreamRequestHandler):
 def handle(self):
  def say(s): self.wfile.write((s+'\r\n').encode())
  say('220 localhost test SMTP')
  while line:=self.rfile.readline():
   verb=line.split()[0].upper()
   if verb in (b'EHLO',b'HELO'): say('250-localhost');say('250 AUTH PLAIN')
   elif verb==b'AUTH': say('334 ');self.rfile.readline();say('235 Authenticated')
   elif verb==b'DATA':
    say('354 End data'); data=b''
    while (line:=self.rfile.readline())!=b'.\r\n':
     if not line: return
     data+=line
    messages.append(data);say('250 Queued')
   elif verb==b'QUIT': say('221 Bye');return
   else: say('250 OK')
smtp=socketserver.ThreadingTCPServer(('127.0.0.1',0),SMTP)
threading.Thread(target=smtp.serve_forever,daemon=True).start()
config=root/'config.php'
config.write_text("<?php return "+"['smtp_host'=>'127.0.0.1','smtp_port'=>%d,'smtp_security'=>'','smtp_user'=>'test@example.test','smtp_password'=>'local-test-only','recipient'=>'recipient@example.test','public_url'=>'http://127.0.0.1:18765','allowed_origins'=>['http://localhost'],'storage_dir'=>'%s'];"%(smtp.server_address[1],root/'data'))
env=dict(os.environ,ORDER_CONFIG=str(config))
log=open(root/'server.log','w')
server=subprocess.Popen([php,'-d','upload_max_filesize=30M','-d','post_max_size=155M','-d','memory_limit=256M','-S','127.0.0.1:18765','-t',str(repo)],env=env,stdout=log,stderr=log)
url='http://127.0.0.1:18765/api/order.php'
photo=next(repo.glob('assets/**/*.jpg')).read_bytes()
def request(data=None,blob=photo,name='test.jpg',origin='http://localhost'):
 fields={'contact':'buyer@example.test','consent':'on','delivery':'cdek','city':'Тест','cdekCityCode':'1852998','cdekPvzCode':'ZNA16','name':'Покупатель','comment':'Проверка тестового письма','size':'30×40','frame':'on','requestId':secrets.token_hex(16)}
 fields.update(data or {})
 return requests.post(url,data=fields,files={'photos[]':(name,blob)},headers={'Origin':origin},timeout=30)
try:
 for _ in range(100):
  try: requests.get(url,timeout=.2);break
  except requests.ConnectionError: time.sleep(.1)
 assert requests.get(url).status_code==405
 assert request(origin='https://evil.test').status_code==403
 assert request({'formType':'invalid'}).status_code==422
 assert request({'consent':''}).status_code==422
 assert request({'cdekPvzCode':'FAKE'}).status_code==422
 assert request(blob=b'<?php echo 1;',name='image.jpg').status_code==422
 id=secrets.token_hex(16);r=request({'requestId':id});assert r.status_code==200 and json.loads(r.text).get('ok'),r.text
 assert request({'requestId':id}).status_code==200
 assert len(messages)==1,len(messages)
 parsed=email.message_from_bytes(messages[0],policy=policy.default)
 body=parsed.get_body(preferencelist=('plain',)).get_content()
 assert 'ZNA16' in body and 'ул Пролетарская, 47' in body and 'Покупатель' in body
 assert len(list(parsed.iter_attachments()))==1
 assert parsed['Reply-To']=='buyer@example.test'
 record=json.loads((root/'data'/id/'order.json').read_text())
 download=f'http://127.0.0.1:18765/api/order-file.php?id={id}&token={record["token"]}&file=0'
 assert requests.get(download).content==photo
 assert requests.get(download.replace(record['token'],'bad')).status_code==404
 large=photo+b'\0'*(19*1024*1024)
 r=request(blob=large);assert r.status_code==200 and json.loads(r.text).get('ok'),r.text
 big=email.message_from_bytes(messages[-1],policy=policy.default)
 assert len(list(big.iter_attachments()))==0
 assert 'order-file.php?' in big.get_content()
 record['expires']=0;(root/'data'/id/'order.json').write_text(json.dumps(record))
 assert requests.get(download).status_code==404
 subprocess.run([php,str(repo/'scripts/cleanup-orders.php')],env=env,check=True)
 assert not (root/'data'/id).exists()
 for kind,label in [('quick','Быстрый заказ'),('messenger','Быстрый заказ — страница QR')]:
  quick_id=secrets.token_hex(16)
  fields={'formType':kind,'contact':'@testbuyer','comment':'Только фото и контакт','consent':'on','requestId':quick_id}
  r=requests.post(url,data=fields,files={'photos[]':('photo.jpg',photo)},headers={'Origin':'http://localhost'},timeout=30)
  assert r.status_code==200 and json.loads(r.text)['orderId']==quick_id,r.text
  quick_mail=email.message_from_bytes(messages[-1],policy=policy.default)
  quick_body=quick_mail.get_body(preferencelist=('plain',)).get_content()
  assert label in quick_mail['Subject'] and label in quick_body
  assert '@testbuyer' in quick_body and 'Только фото и контакт' in quick_body
  assert 'ПВЗ' not in quick_body and 'Багет: Нет' not in quick_body
  assert len(list(quick_mail.iter_attachments()))==1
  before=len(messages)
  r=requests.post(url,data=fields,files={'photos[]':('photo.jpg',photo)},headers={'Origin':'http://localhost'},timeout=30)
  assert r.status_code==200 and len(messages)==before
  fields['consent']=''
  assert requests.post(url,data=fields,files={'photos[]':('photo.jpg',photo)},headers={'Origin':'http://localhost'},timeout=30).status_code==422
 print('PASS: quick and QR forms,  validation, CDEK canonical address, local SMTP, Reply-To, attachment, large-photo links, duplicate prevention, token/expiry, cleanup')
except:
 print((root/'server.log').read_text());raise
finally:
 server.terminate();server.wait();smtp.shutdown()
