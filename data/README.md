# Як редагувати сайт TexnoPlaza

Сайт збирається з даних у цій папці. Після будь-яких змін виконайте `npm run build` (локально) або зробіть commit/push — Vercel перезбере сайт автоматично.

## Файли
- **products.json** — усі 52 кондиціонери. Кожен товар:
  - `name`, `brand`, `series`, `price` (грн, число без пробілів), `btu`, `area` (м²)
  - `wifi`/`inverter`/`heatpump` — `true`/`false`
  - `specs` — `power_w`, `eclass` (A++…), `noise` (дБ), `heat_min`, `cool_min`, `cool_max`
  - `desc_uk` / `desc_ru` / `desc_en` — описи
  - `slug` — частина URL (`/kondicioner/<slug>/`). **Не змінюйте** в існуючих (зламає посилання/SEO).
  - `bestseller: true` — модель у блоці «Хіт продажів» на головній (має бути лише в однієї).
  - `photos`, `thumb` — шляхи до фото (генеруються скриптом, вручну не чіпати).

## Змінити ціну / характеристику
1. Відкрийте `products.json`, знайдіть товар за `name`, змініть значення.
2. Commit + push (або `npm run build`).

## Додати новий товар
1. Покладіть фото в `C:\Rozetka_Automation\ФОТО_SRC\ФОТО\<номер> - <назва>\`.
2. Додайте об'єкт у `products.json` (з `slug`, `srcIndex` = номер папки−1).
3. `npm run images` (вирізає фон + робить файли), потім `npm run build`.

## Глобальні дані
- **site.json** — телефон, адреса, графік, ціна монтажу (`installPrice`), бренди, домен (`baseUrl`).
- **i18n.json** — усі тексти інтерфейсу (uk/ru/en).
