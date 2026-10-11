/* إعدادات مستقلة لتسهيل ربط نسخة لاحقة بباك إند. */
window.PPUConfig = Object.freeze({
  // اترك القائمة فارغة لقبول صيغة بريد صحيحة. أضف النطاقات بعد تأكيدها من الجامعة.
  acceptedEmailDomains: [],
  storageKey: 'ppu-complaints-v1',
  ratingKey: 'ppu-ratings-v1',
  maxImageBytes: 5 * 1024 * 1024,
  services: [
    { id: 'internet', name: 'الإنترنت', icon: 'wifi', description: 'شبكة الإنترنت وخدماتها', color: 'teal' },
    { id: 'classrooms', name: 'القاعات والمقاعد', icon: 'chairs', description: 'القاعات الدراسية والمقاعد', color: 'blue' },
    { id: 'cleanliness', name: 'النظافة', icon: 'broom', description: 'نظافة المباني والمرافق العامة', color: 'teal' },
    { id: 'facilities', name: 'المرافق', icon: 'building', description: 'المرافق العامة والمياه والكهرباء', color: 'blue' },
    { id: 'library', name: 'المكتبة', icon: 'book', description: 'مكتبة الجامعة ومصادر التعلّم', color: 'teal' },
    { id: 'other', name: 'خدمات أخرى', icon: 'dots', description: 'أي خدمة أخرى تحتاج إلى تحسين', color: 'blue' }
  ],
  statuses: ['تم الإرسال', 'قيد المراجعة', 'قيد المعالجة', 'تم الحل']
});
