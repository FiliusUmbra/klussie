-- Adds Spanish (es) and Persian (fa) to the supported locales.
--
-- Three things have to move together or the new languages are half-added: the check
-- constraints that decide which locale values are legal, the catalog translations that
-- give every category and service a name, and the client's LANGS list (src/lib/lang.js,
-- already updated). Miss the second and a Persian customer sees a fully translated shell
-- wrapped around blank service names, because SERVICE_I18N['fa'] would not exist.
--
-- Persian is right-to-left, like Arabic. That is a client concern (RTL_LANGS in
-- src/lib/langContext.js) and needs nothing from the database.
--
-- Guarded throughout, same as 0013-0016: this repository keeps no migration ledger, so
-- re-running this file is a no-op rather than an error. Run
-- supabase/diagnostics/CHECK_STATE.sql to see what is actually applied. 0001-0012 are NOT
-- guarded; that note covers this file only.

-- =========================================================================
-- CONSTRAINTS
--
-- All three carry the default names Postgres generated for the inline checks in
-- 0001_init.sql. Dropped and re-added rather than altered, because a check constraint
-- cannot be widened in place.
--
-- Order matters against the inserts below: widen first, or every insert fails.

alter table public.profiles drop constraint if exists profiles_locale_check;
alter table public.profiles
  add constraint profiles_locale_check
  check (locale in ('nl','fr','de','en','es','ar','fa','tr','ru','zh'));

alter table public.category_translations drop constraint if exists category_translations_locale_check;
alter table public.category_translations
  add constraint category_translations_locale_check
  check (locale in ('nl','fr','de','en','es','ar','fa','tr','ru','zh'));

alter table public.service_translations drop constraint if exists service_translations_locale_check;
alter table public.service_translations
  add constraint service_translations_locale_check
  check (locale in ('nl','fr','de','en','es','ar','fa','tr','ru','zh'));

-- =========================================================================
-- CATEGORY NAMES
--
-- on conflict do update rather than do nothing: re-running this file should correct a
-- translation, not silently keep an older one.
insert into public.category_translations (category_id, locale, name) values
  ('cleaning','es',$$Limpieza$$),        ('cleaning','fa',$$نظافت$$),
  ('moving','es',$$Mudanzas$$),          ('moving','fa',$$اسباب‌کشی$$),
  ('renovation','es',$$Reformas$$),      ('renovation','fa',$$بازسازی$$),
  ('repair','es',$$Reparaciones$$),      ('repair','fa',$$تعمیرات$$),
  ('tutoring','es',$$Clases particulares$$), ('tutoring','fa',$$تدریس خصوصی$$),
  ('events','es',$$Eventos$$),           ('events','fa',$$رویدادها$$),
  ('specialist','es',$$Especialistas$$), ('specialist','fa',$$متخصصان$$),
  ('other','es',$$Otros$$),              ('other','fa',$$سایر$$)
on conflict (category_id, locale) do update set name = excluded.name;

-- =========================================================================
-- SERVICE NAMES AND BLURBS
--
-- Service ids are the fixed seed UUIDs from 0001_init.sql.
insert into public.service_translations (service_id, locale, name, blurb) values
  ('00000000-0000-0000-0000-000000000001','es',$$Pintura y enlucido$$,$$Pintura interior y exterior, preparación de paredes y retoques por pintores verificados.$$),
  ('00000000-0000-0000-0000-000000000001','fa',$$نقاشی و سفیدکاری$$,$$نقاشی داخلی و خارجی، آماده‌سازی دیوار و ترمیم توسط نقاشان تأییدشده.$$),

  ('00000000-0000-0000-0000-000000000002','es',$$Servicio de mudanzas$$,$$Mudanzas completas con embalaje, carga y transporte.$$),
  ('00000000-0000-0000-0000-000000000002','fa',$$خدمات اسباب‌کشی$$,$$اسباب‌کشی کامل منزل شامل بسته‌بندی، بارگیری و حمل.$$),

  ('00000000-0000-0000-0000-000000000003','es',$$Limpieza del hogar$$,$$Limpieza a fondo puntual o periódica para pisos y casas.$$),
  ('00000000-0000-0000-0000-000000000003','fa',$$نظافت منزل$$,$$نظافت عمیق دوره‌ای یا یک‌باره برای آپارتمان و خانه.$$),

  ('00000000-0000-0000-0000-000000000004','es',$$Limpieza de salida$$,$$Limpieza de fin de contrato para recuperar tu fianza sin complicaciones.$$),
  ('00000000-0000-0000-0000-000000000004','fa',$$نظافت پایان اجاره$$,$$نظافت هنگام تخلیه برای بازپس‌گیری ودیعه، بدون دردسر.$$),

  ('00000000-0000-0000-0000-000000000005','es',$$Muebles de cocina a medida$$,$$Mobiliario de cocina hecho a medida para tu espacio.$$),
  ('00000000-0000-0000-0000-000000000005','fa',$$کابینت آشپزخانه سفارشی$$,$$کابینت آشپزخانه اندازه‌گیری و ساخته‌شده متناسب با فضای شما.$$),

  ('00000000-0000-0000-0000-000000000006','es',$$Alicatado$$,$$Colocación de azulejos en suelos y paredes de baños, cocinas y terrazas.$$),
  ('00000000-0000-0000-0000-000000000006','fa',$$کاشی‌کاری$$,$$کاشی‌کاری کف و دیوار برای حمام، آشپزخانه و تراس.$$),

  ('00000000-0000-0000-0000-000000000007','es',$$Transporte de muebles$$,$$Transporte de un solo mueble o pequeñas cargas de muebles y electrodomésticos.$$),
  ('00000000-0000-0000-0000-000000000007','fa',$$حمل مبلمان$$,$$حمل تک‌قطعه یا بار سبک برای مبلمان و لوازم خانگی.$$),

  ('00000000-0000-0000-0000-000000000008','es',$$Clases de inglés (en línea)$$,$$Clases de inglés individuales en línea para cualquier nivel, en tu horario.$$),
  ('00000000-0000-0000-0000-000000000008','fa',$$تدریس خصوصی انگلیسی (آنلاین)$$,$$کلاس‌های خصوصی آنلاین انگلیسی برای همه سطوح، در زمان دلخواه شما.$$),

  ('00000000-0000-0000-0000-000000000009','es',$$Trabajos eléctricos$$,$$Cableado, enchufes, luminarias y revisiones de seguridad por electricistas autorizados.$$),
  ('00000000-0000-0000-0000-000000000009','fa',$$کارهای برقی$$,$$سیم‌کشی، پریز، روشنایی و بازرسی ایمنی توسط برق‌کاران دارای مجوز.$$),

  ('00000000-0000-0000-0000-000000000010','es',$$Limpieza de sofás y alfombras$$,$$Limpieza a vapor y en profundidad de sofás, sillones y colchones.$$),
  ('00000000-0000-0000-0000-000000000010','fa',$$شست‌وشوی مبل و فرش$$,$$بخارشویی و شست‌وشوی عمیق مبل، صندلی و تشک.$$),

  ('00000000-0000-0000-0000-000000000011','es',$$Fontanería$$,$$Fugas, tuberías e instalaciones sanitarias por fontaneros autorizados.$$),
  ('00000000-0000-0000-0000-000000000011','fa',$$لوله‌کشی$$,$$نشتی، لوله‌کشی و نصب تجهیزات بهداشتی توسط لوله‌کشان دارای مجوز.$$),

  ('00000000-0000-0000-0000-000000000012','es',$$Asesoría legal para extranjeros$$,$$Ayuda con permisos de residencia, contratos y trámites administrativos por asesores legales colegiados.$$),
  ('00000000-0000-0000-0000-000000000012','fa',$$مشاوره حقوقی برای اتباع خارجی$$,$$کمک در زمینه اجازه اقامت، قرارداد و امور اداری توسط مشاوران حقوقی دارای مجوز.$$),

  ('00000000-0000-0000-0000-000000000013','es',$$Traducción jurada$$,$$Traducción oficial y reconocida por los tribunales para trámites administrativos.$$),
  ('00000000-0000-0000-0000-000000000013','fa',$$ترجمه رسمی$$,$$ترجمه رسمی و مورد تأیید دادگاه برای امور اداری و دولتی.$$),

  ('00000000-0000-0000-0000-000000000014','es',$$Retirada de amianto$$,$$Retirada y eliminación segura y legalmente certificada de materiales con amianto.$$),
  ('00000000-0000-0000-0000-000000000014','fa',$$برداشت آزبست$$,$$برداشت و دفع ایمن و دارای گواهی قانونی مواد حاوی آزبست.$$),

  ('00000000-0000-0000-0000-000000000015','es',$$Certificado energético$$,$$Certificado de eficiencia energética obligatorio, emitido por un técnico autorizado.$$),
  ('00000000-0000-0000-0000-000000000015','fa',$$گواهی بهره‌وری انرژی$$,$$گواهی اجباری عملکرد انرژی، تهیه‌شده توسط کارشناس دارای مجوز.$$)
on conflict (service_id, locale) do update set name = excluded.name, blurb = excluded.blurb;
