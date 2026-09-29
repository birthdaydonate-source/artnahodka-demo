"""Build topic pages from the approved family article and shared gallery catalog.

Run from any directory: python3 scripts/build-topic-articles.py
The production footer and analytics markup remain byte-for-byte unchanged.
"""
from pathlib import Path
import html
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
TOPICS = json.loads((ROOT/'assets/data/article-topics.json').read_text())
IMAGES = json.loads((ROOT/'assets/data/article-images.json').read_text())
WORKS = json.loads(subprocess.check_output(['node', '-e', "const fs=require('fs'),vm=require('vm'),c={window:{}};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),c);console.log(JSON.stringify(c.window.ARTNAHODKA_WORKS));", str(ROOT/'assets/js/works.js')]))
BY_ID = {w['id']: w for w in WORKS}
VERSION = '20260929-topics'
esc = html.escape

def image(key, label):
    return {**IMAGES[key], 'label': label}

INTERIOR = []
for kind, title in [('classic','Парусник — живописный горизонтальный формат'),('graphic','Парусник — графика в квадрате'),('watercolor','Парусник — вертикальная акварель')]:
    INTERIOR.append({'id':'sailboat-'+kind,'title':title,'generated':True,'tags':['interior'],'images':[
        image(f'sailboat-{kind}-art','Художественный вариант'), image('sailboat-source','Исходная идея — вымышленная фотография'), image(f'sailboat-{kind}-room','Визуализация картины в интерьере')]})
for key, title in [('botanical','Ботаника — вертикальный акцент'),('triptych','Абстракция — триптих над диваном')]:
    INTERIOR.append({'id':'interior-'+key,'title':title,'generated':True,'tags':['interior'],'images':[image('interior-'+key+'-room','Визуализация решения в интерьере')]})
TEACHER = {'id':'teacher-enlightener','title':'Учитель в образе просветителя','generated':True,'tags':['teacher'],'images':[
    image('teacher-enlightener-art','Портрет в образе просветителя'), BY_ID['caricature-teacher']['images'][1], image('teacher-enlightener-room','Визуализация холста в интерьере')]}
BY_ID.update({w['id']:w for w in [*INTERIOR,TEACHER]})

def img(im, eager=False, thumb=False):
    return f'<img src="../{esc(im["thumb"] if thumb else im["src"])}" width="{im["width"]}" height="{im["height"]}" alt="{esc(im["label"])}" {"fetchpriority=high" if eager else "loading=lazy"}>'

def figure(im, group, index, caption):
    return f'<figure class="article-picture"><button type="button" data-open-project="{group}" data-open-index="{index}" aria-label="Увеличить: {esc(caption)}">{img(im)}</button><figcaption>{esc(caption)}</figcaption></figure>'

def plural(n):
    return 'изображение' if n%10==1 and n%100!=11 else 'изображения' if n%10 in (2,3,4) and n%100 not in (12,13,14) else 'изображений'

def card(w):
    ims=w['images']; title=esc(w['title']); key=esc(w['id'])
    strip=''.join(f'<button type="button" data-photo-group="{key}" data-full="../{esc(im["src"])}" data-caption="{title} · {esc(im["label"])}" aria-label="{esc(im["label"])} — {title}">{img(im,thumb=True)}</button>' for im in ims)
    label=f'{len(ims)} {plural(len(ims))}'+(' · пример стилизации' if w.get('generated') else '')+' · нажмите, чтобы рассмотреть'
    return f'<article class="article-project" data-work="{key}" data-tags="{esc(" ".join(w["tags"]))}"><button class="article-project__main" type="button" data-open-project="{key}" aria-label="Открыть проект: {title}">{img(ims[0],thumb=True)}</button><h3>{title}</h3><div class="article-project__strip">{strip}</div><p class="article-project__label">{label}</p></article>'

def gallery(topic):
    key=topic['gallery']
    if key=='interior': return INTERIOR
    if key=='teacher': return [BY_ID['caricature-teacher'],TEACHER]
    selected=[w for w in WORKS if key in w['tags']]
    if key=='styles':
        selected.sort(key=lambda w: 0 if 'dreamart' in w['tags'] else 1 if 'painterly' in w['tags'] else 2)
    return selected

def menu(prefix):
    groups=[('Семейные портреты',[('family-from-photos','Семья из разных фото'),('pet-portraits','Фото ваших питомцев')]),('Стили и образы',[('caricatures','Шаржи и карикатуры'),('dream-art','Дрим-арт и стилизации')]),('Для интерьера',[('interior-art','Картины по вашей идее')]),('Идеи подарков',[('teacher-gift','Подарок учителю')])]
    sections=''.join('<details class="article-menu__section"><summary>'+name+'</summary>'+''.join(f'<a href="{prefix}{slug}.html">{title}</a>' for slug,title in pages)+'</details>' for name,pages in groups)
    return f'<details class="article-menu" data-articles-menu><summary>Статьи</summary><div class="article-menu__panel"><a href="{prefix}index.html">Все статьи</a>{sections}</div></details>'

def update_menus(text,prefix):
    marker='<details class="article-menu" data-articles-menu>'
    pos=0
    while (start:=text.find(marker,pos))!=-1:
        depth=0
        for match in re.finditer(r'</?details\b[^>]*>',text[start:]):
            depth+=-1 if match.group().startswith('</') else 1
            if depth==0:
                end=start+match.end();replacement=menu(prefix)
                text=text[:start]+replacement+text[end:];pos=start+len(replacement);break
        else: raise ValueError('Unbalanced menu')
    for asset in ['articles.css','articles.js','article-order.js']:
        text=re.sub(r'('+re.escape(asset)+r')\?v=[^"\s]+',rf'\1?v={VERSION}',text)
    return text

template=(ROOT/'articles/family-from-photos.html').read_text()
for topic in TOPICS:
    slug=topic['slug'];title=topic['title'];hero=BY_ID[topic['hero']];art,source,room=hero['images'];projects=gallery(topic)
    page=template
    page=re.sub(r'<title>.*?</title>',f'<title>{esc(title)} — Артвентура</title>',page,count=1)
    page=page.replace('https://artnahodka.ru/articles/family-from-photos.html',f'https://artnahodka.ru/articles/{slug}.html')
    for pattern,value in [(r'(<meta name="description" content=")[^"]*',topic['lead']),(r'(<meta property="og:title" content=")[^"]*',title),(r'(<meta property="og:description" content=")[^"]*',topic['lead']),(r'(<meta property="og:image" content=")[^"]*','https://artnahodka.ru/'+art['src'])]:
        page=re.sub(pattern,lambda m:m[1]+esc(value),page,count=1)
    page=page.replace('<span>Семья из разных фото</span></nav>','<span>'+esc(topic['eyebrow'])+'</span></nav>')
    page=page.replace('Обсудить портрет','Обсудить заказ')
    hero_html=f'''<section class="article-hero" aria-labelledby="article-title"><div class="article-hero__intro"><p class="eyebrow">{esc(topic['eyebrow'])}</p><h1 id="article-title">{topic['heading']}</h1><p class="lead">{esc(topic['lead'])}</p><a class="button" href="#order">{esc(topic['cta'])} <span aria-hidden="true">↗</span></a><p class="article-meta">Наглядный разбор · Примеры · Размеры и цены</p></div><div class="article-comparison"><div class="article-comparison__stage"><figure class="article-picture article-comparison__result"><button type="button" data-open-project="case" data-open-index="1" aria-label="Увеличить результат">{img(art,True)}</button><figcaption>{esc(topic['heroCaption'])}</figcaption></figure><button class="article-comparison__source" type="button" data-open-project="case" data-open-index="0" aria-label="Рассмотреть исходное изображение">{img(source)}<span>{topic['sourceLabel']} <b aria-hidden="true">↗</b></span></button></div><p class="article-comparison__note">ИИ-пример: вымышленный сюжет{'' if slug=='interior-art' else ' и герои'}. Нажмите на изображение, чтобы рассмотреть.</p></div></section>'''
    page=page[:page.index('<section class="article-hero"')]+hero_html+page[page.index('<div class="article-layout">'):]
    copy=''
    for section in topic['sections']:
        extra=''
        if section['id']=='example':
            if slug=='interior-art':
                extra='<div class="article-variants">'+''.join(figure(w['images'][0],w['id'],0,cap) for w,cap in zip(INTERIOR[:3],['01 · Живописный','02 · Графический','03 · Акварельный']))+'</div>'+figure(room,'case',2,'Картина в интерьере — визуализация')
            else:
                extra='<div class="article-pair">'+figure(source,'case',0,'01 · Исходная фотография')+figure(art,'case',1,'02 · Художественный образ')+'</div>'+figure(room,'case',2,'03 · Визуализация холста в интерьере')
            extra+='<p class="article-example-note">Разбор подготовлен на вымышленном примере с помощью ИИ. Интерьер показывает идею размещения; размер и оформление выбираются отдельно.</p>'
        copy+=f'<section id="{section["id"]}"><h2>{esc(section["title"])}</h2>{section["html"]}{extra}</section>'
    toc=''.join(f'<a href="#{s["id"]}">{esc(s["title"])}</a>' for s in topic['sections'])+'<a href="#sizes">Размеры и цены</a><a href="#projects">Все примеры</a><a href="#order">Обсудить заказ</a>'
    layout=f'<div class="article-layout"><nav class="article-toc" aria-label="Содержание статьи"><b>В этой статье</b>{toc}</nav><div class="article-copy">{copy}</div></div>\n'
    page=page[:page.index('<div class="article-layout">')]+layout+page[page.index('<section class="section article-sizes"'):]
    page=page.replace('Для пары или небольшой семьи. Проверим композицию и крупность лиц.','Универсальный формат для портрета или интерьерной картины. Подберём композицию под ваш сюжет.')
    page=page.replace('Сложную сборку семейного портрета и реставрацию оценим по исходникам. Багет и доставка рассчитываются отдельно.',esc(topic['priceNote']))
    filters=''
    if slug=='dream-art':
        filters='<div class="article-filters" role="group" aria-label="Выбор стиля">'+''.join(f'<button type="button" data-project-filter="{key}" aria-pressed="{str(key=="all").lower()}">{label}</button>' for key,label in [('all','Все стили'),('dreamart','Дрим-арт'),('painterly','Живописные')])+'</div>'
    projects_html=f'<section id="projects" class="article-projects" data-project-gallery><div class="article-section-head"><div><p class="eyebrow">{esc(topic["eyebrow"])}</p><h2>Примеры этого направления</h2><p>{esc(topic["galleryIntro"])}</p></div></div>{filters}<p class="article-gallery-count" aria-live="polite" data-project-count>{len(projects)} примеров</p><div class="article-project-grid">'+''.join(card(w) for w in projects)+'</div><button class="button button--outline article-more" type="button" data-project-more hidden>Показать ещё</button></section>\n'
    page=page[:page.index('<section id="projects"')]+projects_html+page[page.index('<section class="section order-section article-order"'):]
    intro=f'''<div class="order-intro"><p class="eyebrow">Начнём с вашей идеи</p><h2>{topic['orderHeading']}</h2><p>{esc(topic['orderText'])}</p><div class="contact-card"><b>Давайте обсудим в MAX или Telegram</b><p>{esc(topic['chatText'])}</p><div class="messengers" data-messengers="labelled"></div></div><p class="fineprint">{esc(topic['priceNote'])}</p></div>'''
    start=page.index('<div class="order-intro">');end=page.index('<form id="detailed-form"',start)
    page=page[:start]+intro+'\n'+page[end:]
    page=page.replace('<form id="detailed-form"',f'<form id="detailed-form" data-work-id="{slug}" data-work-title="{esc(title)} — заявка со статьи"')
    page=page.replace('1. Фотографии и пожелания',esc(topic['uploadTitle']))
    page=page.replace('Кто будет на портрете и каким вы его представляете',esc(topic['commentLabel']))
    page=re.sub(r'(<textarea name="comment"[^>]*placeholder=")[^"]*',lambda m:m[1]+esc(topic['placeholder']),page,count=1)
    if slug=='interior-art':
        page=page.replace('<div class="upload" data-upload="detailed"></div>','<p class="fineprint">Для заявки через форму приложите фото комнаты, эскиз или пример. Если изображений пока нет, напишите идею в MAX или Telegram.</p><div class="upload" data-upload="detailed"></div>')
    registry='<div hidden aria-hidden="true">'+''.join(f'<span data-photo-group="case" data-full="../{esc(im["src"])}" data-caption="{esc(im["label"])} — ИИ-пример"></span>' for im in [source,art,room])+'</div>'
    page=re.sub(r'<div hidden aria-hidden="true"><span data-photo-group="case".*?</div>',lambda _:registry,page,count=1,flags=re.S)
    page=update_menus(page,'')
    (ROOT/'articles'/f'{slug}.html').write_text(page)

# Keep navigation consistent without rewriting shared production markup.
for name in ['index.html','articles/index.html','articles/family-from-photos.html']:
    p=ROOT/name;p.write_text(update_menus(p.read_text(),'' if name.startswith('articles/') else 'articles/'))

# Six article cards, with the family article remaining first.
hub=ROOT/'articles/index.html';text=hub.read_text()
entries=[{'slug':'family-from-photos','title':'Семья из разных фото','eyebrow':'Семейный портрет','lead':'Как объединить близких на одной картине: разбор сборки и все 12 примеров.','hero':'family-six-grandchildren'},*TOPICS]
cards=''
for t in entries:
    im=BY_ID[t['hero']]['images'][0]
    cards+=f'<article class="articles-card" data-article="{t["slug"]}"><a class="articles-card__image" href="{t["slug"]}.html" tabindex="-1" aria-hidden="true">{img(im,thumb=True)}</a><div><p class="eyebrow">{esc(t["eyebrow"])}</p><h2><a href="{t["slug"]}.html">{esc(t["title"])}</a></h2><p>{esc(t["lead"])}</p><a class="text-link" href="{t["slug"]}.html" aria-label="Читать статью: {esc(t["title"])}">Читать статью ↗</a></div></article>'
main='<nav class="article-breadcrumbs" aria-label="Хлебные крошки"><a href="../index.html">Главная</a><span aria-hidden="true">/</span><span>Статьи</span></nav><section class="articles-heading"><p class="eyebrow">Идеи и примеры</p><h1>От вашей идеи<br>к готовой картине.</h1><p>Наглядные разборы, разные стили и решения для дома и подарка. Выберите тему, посмотрите примеры и обсудите свою задумку с нами.</p></section><div class="articles-grid">'+cards+'</div>'
text=re.sub(r'(<main id="main" class="container">).*?(</main>)',lambda m:m[1]+main+m[2],text,count=1,flags=re.S)
text=re.sub(r'(<meta name="description" content=")[^"]*',r'\1Идеи картин и портретов: семья из разных фото, интерьер, шаржи, питомцы, подарок учителю и дрим-арт. Примеры, размеры, цены и обсуждение заказа.',text,count=1)
text=text.replace('href="family-from-photos.html#order"','href="../index.html#order"')
hub.write_text(text)
sitemap=ROOT/'sitemap.xml';xml=sitemap.read_text()
for t in TOPICS:
    url='https://artnahodka.ru/articles/'+t['slug']+'.html'
    if url not in xml: xml=xml.replace('</urlset>',f'  <url><loc>{url}</loc></url>\n</urlset>')
sitemap.write_text(xml)
print('Built five topic pages, six-card article index and navigation.')
