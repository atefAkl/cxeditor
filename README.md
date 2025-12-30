# EXEditor

إضافة مستقلة (Standalone) لتحويل `textarea` لمحرر نصوص بتنسيقات بسيطة، مع حفظ واسترجاع نفس التنسيقات لأن القيمة تُخزن كـHTML.

## التجربة (Demo)
- افتح: `demo/index.html` في المتصفح
- جرّب التنسيقات، ثم اضغط حفظ/استرجاع (LocalStorage)

## الاستخدام داخل مشروعك
### الطريقة (A): نسخ ملفات `dist` (الأسهل)
1) انسخ المجلدات/الملفات التالية إلى مشروعك (مثلاً داخل `public/vendor/exeditor/`):
- `dist/exeditor.css`
- `dist/exeditor.js`
- مجلد الأيقونات: `dist/svg/`

2) تأكد إن الملفات تُخدم عبر HTTP (مش `file://`).

3) ضفها في الصفحة:
```html
<link rel="stylesheet" href="/vendor/exeditor/exeditor.css">
<script src="/vendor/exeditor/exeditor.js"></script>

<textarea name="content" data-exeditor></textarea>

<script>
  EXEditor.attachAll();
</script>
```

### الطريقة (B): مشاركة داخل الفريق عبر Git
- نفس طريقة (A)، لكن بدل النسخ اليدوي: خلي الإضافة repo مستقل وضمّه كـsubmodule/subtree أو package داخل monorepo.
- عند التحديث: شغّل `node scripts/build.js` ثم استخدم ملفات `dist`.

## الأيقونات (SVG)
- بشكل افتراضي، سيحاول EXEditor تحميل الأيقونات من مسار `svg/` بجانب ملف `exeditor.js`.
- لو مسار الأيقونات مختلف داخل مشروعك، مرّر `iconBaseUrl` (لازم ينتهي بـ `/` أو هنضيفها تلقائياً):
```js
EXEditor.attachAll(undefined, { iconBaseUrl: "/vendor/exeditor/svg/" });
```

ملاحظة: تحميل الأيقونات يتم عبر `fetch`/XHR، لذلك لازم تكون الملفات على نفس الـorigin أو تكون CORS مضبوط.

## API سريع
### `EXEditor.attach(textarea, options)`
```js
var instance = EXEditor.attach(document.querySelector('#content'), {
  linkTargetBlank: true,
  iconBaseUrl: '/vendor/exeditor/svg/',
  onChange: function (html) {
    // html هو نفس قيمة الـtextarea (HTML)
  }
});

// استرجاع محتوى محفوظ
instance.setHTML('<p>...</p>');
```

### `EXEditor.attachAll(selector?, options?)`
```js
EXEditor.attachAll('textarea[data-exeditor]', {
  iconBaseUrl: '/vendor/exeditor/svg/'
});
```

## جاهزية التغليف (NPM) لاحقاً

## التثبيت عبر NPM
بعد نشر الحزمة على npm (أو من registry خاص بالشركة):
```bash
npm i exeditor
```

### استخدام مع Bundler (Vite/Webpack)
```js
import 'exeditor/dist/exeditor.css';
import 'exeditor/dist/exeditor.js';

// ثم لاحقاً بعد تحميل الصفحة:
EXEditor.attachAll(undefined, {
  // لو الأيقونات لا تُخدم تلقائياً من نفس المسار
  iconBaseUrl: '/vendor/exeditor/svg/'
});
```

### استخدام بدون Bundler (بعد النشر)
يمكنك التحميل من CDN (unpkg/jsDelivr) بعد النشر:
```html
<link rel="stylesheet" href="https://unpkg.com/exeditor@0.1.0/dist/exeditor.css">
<script src="https://unpkg.com/exeditor@0.1.0/dist/exeditor.js"></script>
```

ملاحظة: إن استخدمت CDN، الأيقونات سيتم طلبها من `.../dist/svg/` تلقائياً بجانب ملف `exeditor.js`.

## الحفظ والاسترجاع
- احفظ قيمة الـtextarea (مثلاً في قاعدة بيانات) كما هي (HTML).
- عند الاسترجاع: ضع الـHTML داخل textarea قبل استدعاء `EXEditor.attach(...)` أو استخدم `instance.setHTML(html)`.

## ملاحظة أمنية مهمة
لو المحتوى يأتي من مستخدمين غير موثوقين، لازم تعمل Sanitization على السيرفر قبل عرضه كـHTML (لتجنب XSS).

## Build
- `npm run build`
ينسخ ملفات `src` إلى `dist`.
