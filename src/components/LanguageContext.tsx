"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export type LanguageCode = "EN" | "RU" | "AR" | "TR" | "ZH" | "ES";

const translations: Record<LanguageCode, Record<string, string>> = {
  EN: {
    "nav.shop": "Shop",
    "nav.wallet": "Wallet",
    "nav.orders": "Orders",
    "nav.tickets": "Tickets",
    "nav.profile": "Profile",
    "hero.subtitle": "◆ Private marketplace",
    "hero.title": "The Camel971 experience, refined.",
    "hero.desc": "Experience seamless shopping, manage your funds securely, and track orders with absolute confidence.",
    "hero.dashboard": "Open dashboard",
    "hero.create": "Create account",
    "hero.signin": "Sign in",
    "relax.title": "Forget your stress, relax and let us handle the rest.",
    "relax.desc": "Our seamless process guarantees that you can enjoy your time without worrying about the details. Let Camel971 provide the ultimate smooth experience.",
    "reviews.title": "Reviews",
    "reviews.anyType": "Any type",
    "reviews.anyCity": "Any City",
    "reviews.anyProduct": "Any product",
    "reviews.loadMore": "Load more",
    "reviews.write": "Write a Review",
    "reviews.login": "Log in to review",
    "reviews.submit": "Submit Review",
    "dash.title": "Browse with confidence.",
    "dash.subtitle": "Choose a city to tailor what you see, then explore products from one streamlined dashboard.",
    "dash.city": "Delivery city",
    "dash.anycity": "Any city",
    "dash.area": "Delivery area",
    "dash.anyarea": "Any area",
    "dash.bot.title": "Shop 24/7 with Telegram Bot",
    "dash.bot.desc": "Instant access to the store anytime, anywhere.",
    "dash.bot.btn": "🤖 Configure Bot →",
    "footer.desc": "A premium, privacy-first marketplace with secure ordering and always-on Telegram access.",
    "footer.explore": "Explore",
    "footer.home": "Home",
    "footer.create": "Create account",
    "footer.signin": "Sign in",
    "footer.secure": "Secure access",
    "footer.bot": "Telegram Bot",
    "footer.wallet": "Encrypted wallet",
    "footer.247": "24/7 availability",
    "footer.appearance": "Appearance",
    "footer.theme": "Choose the view that feels right for you.",
    "product.view": "View Product"
  },
  RU: {
    "nav.shop": "Магазин",
    "nav.wallet": "Кошелек",
    "nav.orders": "Заказы",
    "nav.tickets": "Билеты",
    "nav.profile": "Профиль",
    "hero.subtitle": "◆ Частный рынок",
    "hero.title": "Опыт Camel971, усовершенствованный.",
    "hero.desc": "Наслаждайтесь удобными покупками, безопасно управляйте своими средствами и отслеживайте заказы с полной уверенностью.",
    "hero.dashboard": "Открыть панель",
    "hero.create": "Создать аккаунт",
    "hero.signin": "Войти",
    "relax.title": "Забудьте о стрессе, расслабьтесь и предоставьте все нам.",
    "relax.desc": "Наш безупречный процесс гарантирует, что вы сможете наслаждаться временем, не беспокоясь о деталях. Позвольте Camel971 обеспечить вам максимально комфортный опыт.",
    "reviews.title": "Отзывы",
    "reviews.anyType": "Любой тип",
    "reviews.anyCity": "Любой город",
    "reviews.anyProduct": "Любой продукт",
    "reviews.loadMore": "Загрузить еще",
    "reviews.write": "Написать отзыв",
    "reviews.login": "Войдите для отзыва",
    "reviews.submit": "Отправить отзыв",
    "dash.title": "Покупайте с уверенностью.",
    "dash.subtitle": "Выберите город для настройки отображения, затем исследуйте продукты в удобной панели.",
    "dash.city": "Город доставки",
    "dash.anycity": "Любой город",
    "dash.area": "Район доставки",
    "dash.anyarea": "Любой район",
    "dash.bot.title": "Покупайте 24/7 с Telegram ботом",
    "dash.bot.desc": "Мгновенный доступ к магазину в любое время и в любом месте.",
    "dash.bot.btn": "🤖 Настроить бота →",
    "footer.desc": "Премиальный рынок с приоритетом конфиденциальности, безопасным заказом и постоянным доступом через Telegram.",
    "footer.explore": "Исследовать",
    "footer.home": "Главная",
    "footer.create": "Создать аккаунт",
    "footer.signin": "Войти",
    "footer.secure": "Безопасный доступ",
    "footer.bot": "Telegram Бот",
    "footer.wallet": "Зашифрованный кошелек",
    "footer.247": "Доступность 24/7",
    "footer.appearance": "Внешний вид",
    "footer.theme": "Выберите подходящий для вас вид.",
    "product.view": "Посмотреть продукт"
  },
  AR: {
    "nav.shop": "المتجر",
    "nav.wallet": "المحفظة",
    "nav.orders": "الطلبات",
    "nav.tickets": "التذاكر",
    "nav.profile": "الملف الشخصي",
    "hero.subtitle": "◆ سوق خاص",
    "hero.title": "تجربة Camel971 المطورة.",
    "hero.desc": "استمتع بتسوق سلس، وقم بإدارة أموالك بأمان، وتتبع الطلبات بثقة مطلقة.",
    "hero.dashboard": "افتح لوحة القيادة",
    "hero.create": "إنشاء حساب",
    "hero.signin": "تسجيل الدخول",
    "relax.title": "انسَ توترك، استرخِ ودع الباقي علينا.",
    "relax.desc": "تضمن لك عمليتنا السلسة الاستمتاع بوقتك دون القلق بشأن التفاصيل. دع Camel971 توفر لك تجربة سلسة لا مثيل لها.",
    "reviews.title": "التقييمات",
    "reviews.anyType": "أي نوع",
    "reviews.anyCity": "أي مدينة",
    "reviews.anyProduct": "أي منتج",
    "reviews.loadMore": "تحميل المزيد",
    "reviews.write": "اكتب مراجعة",
    "reviews.login": "تسجيل الدخول",
    "reviews.submit": "إرسال المراجعة",
    "dash.title": "تصفح بثقة.",
    "dash.subtitle": "اختر مدينة لتخصيص ما تراه، ثم استكشف المنتجات من لوحة تحكم واحدة مبسطة.",
    "dash.city": "مدينة التوصيل",
    "dash.anycity": "أي مدينة",
    "dash.area": "منطقة التوصيل",
    "dash.anyarea": "أي منطقة",
    "dash.bot.title": "تسوق على مدار الساعة طوال أيام الأسبوع مع بوت تيليجرام",
    "dash.bot.desc": "وصول فوري إلى المتجر في أي وقت وفي أي مكان.",
    "dash.bot.btn": "🤖 إعداد البوت →",
    "footer.desc": "سوق مميز يعطي الأولوية للخصوصية مع طلب آمن ووصول دائم عبر تيليجرام.",
    "footer.explore": "استكشف",
    "footer.home": "الرئيسية",
    "footer.create": "إنشاء حساب",
    "footer.signin": "تسجيل الدخول",
    "footer.secure": "وصول آمن",
    "footer.bot": "بوت تيليجرام",
    "footer.wallet": "محفظة مشفرة",
    "footer.247": "متاح 24/7",
    "footer.appearance": "المظهر",
    "footer.theme": "اختر العرض الذي يناسبك.",
    "product.view": "عرض المنتج"
  },
  TR: {
    "nav.shop": "Mağaza",
    "nav.wallet": "Cüzdan",
    "nav.orders": "Siparişler",
    "nav.tickets": "Biletler",
    "nav.profile": "Profil",
    "hero.subtitle": "◆ Özel pazar",
    "hero.title": "Camel971 deneyimi, geliştirildi.",
    "hero.desc": "Sorunsuz alışverişi deneyimleyin, paranızı güvenle yönetin ve siparişleri tam bir güvenle takip edin.",
    "hero.dashboard": "Paneli Aç",
    "hero.create": "Hesap Oluştur",
    "hero.signin": "Giriş Yap",
    "relax.title": "Stresinizi unutun, rahatlayın ve gerisini bize bırakın.",
    "relax.desc": "Kusursuz sürecimiz, detaylar hakkında endişelenmeden zamanınızın tadını çıkarmanızı garanti eder. Camel971'in nihai pürüzsüz deneyimi sunmasına izin verin.",
    "reviews.title": "İncelemeler",
    "reviews.anyType": "Herhangi Bir Tip",
    "reviews.anyCity": "Herhangi Bir Şehir",
    "reviews.anyProduct": "Herhangi Bir Ürün",
    "reviews.loadMore": "Daha Fazla",
    "reviews.write": "İnceleme Yaz",
    "reviews.login": "İnceleme İçin Giriş Yap",
    "reviews.submit": "Gönder",
    "dash.title": "Güvenle gezinin.",
    "dash.subtitle": "Gördüklerinizi kişiselleştirmek için bir şehir seçin, ardından ürünleri tek bir panelden keşfedin.",
    "dash.city": "Teslimat şehri",
    "dash.anycity": "Herhangi bir şehir",
    "dash.area": "Teslimat bölgesi",
    "dash.anyarea": "Herhangi bir bölge",
    "dash.bot.title": "Telegram Botu ile 7/24 Alışveriş Yapın",
    "dash.bot.desc": "Mağazaya her zaman, her yerden anında erişim.",
    "dash.bot.btn": "🤖 Botu Yapılandır →",
    "footer.desc": "Güvenli sipariş ve her zaman açık Telegram erişimi ile birinci sınıf, gizlilik öncelikli bir pazar yeri.",
    "footer.explore": "Keşfet",
    "footer.home": "Ana Sayfa",
    "footer.create": "Hesap oluştur",
    "footer.signin": "Giriş yap",
    "footer.secure": "Güvenli erişim",
    "footer.bot": "Telegram Botu",
    "footer.wallet": "Şifreli cüzdan",
    "footer.247": "7/24 erişilebilirlik",
    "footer.appearance": "Görünüm",
    "footer.theme": "Size uygun görünümü seçin.",
    "product.view": "Ürünü Görüntüle"
  },
  ZH: {
    "nav.shop": "商店",
    "nav.wallet": "钱包",
    "nav.orders": "订单",
    "nav.tickets": "工单",
    "nav.profile": "个人资料",
    "hero.subtitle": "◆ 私人市场",
    "hero.title": "精致的 Camel971 体验。",
    "hero.desc": "体验无缝购物，安全管理您的资金，并充满信心地跟踪订单。",
    "hero.dashboard": "打开控制面板",
    "hero.create": "创建账户",
    "hero.signin": "登录",
    "relax.title": "忘记压力，放松身心，把剩下的交给我们。",
    "relax.desc": "我们无缝的流程保证您可以享受您的时间而无需担心细节。让 Camel971 为您提供极致顺畅的体验。",
    "reviews.title": "评论",
    "reviews.anyType": "任何类型",
    "reviews.anyCity": "任何城市",
    "reviews.anyProduct": "任何产品",
    "reviews.loadMore": "加载更多",
    "reviews.write": "写评论",
    "reviews.login": "登录后评论",
    "reviews.submit": "提交评论",
    "dash.title": "充满信心地浏览。",
    "dash.subtitle": "选择一个城市以定制您看到的内容，然后从一个简化的仪表板探索产品。",
    "dash.city": "配送城市",
    "dash.anycity": "任何城市",
    "dash.area": "配送区域",
    "dash.anyarea": "任何区域",
    "dash.bot.title": "使用 Telegram 机器人进行全天候购物",
    "dash.bot.desc": "随时随地即时访问商店。",
    "dash.bot.btn": "🤖 配置机器人 →",
    "footer.desc": "一个高级的、隐私优先的市场，具有安全的订单和始终在线的 Telegram 访问。",
    "footer.explore": "探索",
    "footer.home": "首页",
    "footer.create": "创建账户",
    "footer.signin": "登录",
    "footer.secure": "安全访问",
    "footer.bot": "Telegram 机器人",
    "footer.wallet": "加密钱包",
    "footer.247": "全天候可用性",
    "footer.appearance": "外观",
    "footer.theme": "选择适合您的视图。",
    "product.view": "查看产品"
  },
  ES: {
    "nav.shop": "Tienda",
    "nav.wallet": "Billetera",
    "nav.orders": "Pedidos",
    "nav.tickets": "Boletos",
    "nav.profile": "Perfil",
    "hero.subtitle": "◆ Mercado privado",
    "hero.title": "La experiencia Camel971, refinada.",
    "hero.desc": "Experimente compras fluidas, administre sus fondos de manera segura y rastree pedidos con absoluta confianza.",
    "hero.dashboard": "Abrir panel",
    "hero.create": "Crear cuenta",
    "hero.signin": "Iniciar sesión",
    "relax.title": "Olvídese del estrés, relájese y déjenos el resto a nosotros.",
    "relax.desc": "Nuestro proceso fluido garantiza que pueda disfrutar de su tiempo sin preocuparse por los detalles. Deje que Camel971 le brinde la mejor experiencia sin problemas.",
    "reviews.title": "Reseñas",
    "reviews.anyType": "Cualquier tipo",
    "reviews.anyCity": "Cualquier ciudad",
    "reviews.anyProduct": "Cualquier producto",
    "reviews.loadMore": "Cargar más",
    "reviews.write": "Escribir una reseña",
    "reviews.login": "Inicie sesión para opinar",
    "reviews.submit": "Enviar reseña",
    "dash.title": "Navegue con confianza.",
    "dash.subtitle": "Elija una ciudad para adaptar lo que ve, luego explore productos desde un panel optimizado.",
    "dash.city": "Ciudad de entrega",
    "dash.anycity": "Cualquier ciudad",
    "dash.area": "Área de entrega",
    "dash.anyarea": "Cualquier área",
    "dash.bot.title": "Compre 24/7 con el bot de Telegram",
    "dash.bot.desc": "Acceso instantáneo a la tienda en cualquier momento y en cualquier lugar.",
    "dash.bot.btn": "🤖 Configurar bot →",
    "footer.desc": "Un mercado premium centrado en la privacidad con pedidos seguros y acceso constante a Telegram.",
    "footer.explore": "Explorar",
    "footer.home": "Inicio",
    "footer.create": "Crear cuenta",
    "footer.signin": "Iniciar sesión",
    "footer.secure": "Acceso seguro",
    "footer.bot": "Bot de Telegram",
    "footer.wallet": "Billetera encriptada",
    "footer.247": "Disponibilidad 24/7",
    "footer.appearance": "Apariencia",
    "footer.theme": "Elija la vista que mejor se adapte a usted.",
    "product.view": "Ver producto"
  }
};

interface LanguageContextProps {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextProps>({
  language: "EN",
  setLanguage: () => {},
  t: (key) => key,
});

export const useLanguage = () => useContext(LanguageContext);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<LanguageCode>("EN");

  useEffect(() => {
    // 1. Read stored language
    const saved = localStorage.getItem("appLanguage") as LanguageCode;
    if (saved && translations[saved]) {
      setLanguageState(saved);
    } else {
      setLanguageState("EN");
    }

    // 2. Inject Google Translate Script
    if (typeof window !== "undefined") {
      window.googleTranslateElementInit = () => {
        if (!window.google || !window.google.translate) return;
        new window.google.translate.TranslateElement(
          { 
            pageLanguage: 'en', 
            autoDisplay: true,
            // Include all supported languages
            includedLanguages: 'en,ru,ar,tr,kk,uk'
          },
          'google_translate_element'
        );
      };

      if (!document.getElementById("google-translate-script")) {
        const script = document.createElement("script");
        script.id = "google-translate-script";
        script.src = "//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
        script.async = true;
        document.body.appendChild(script);
      }
    }
  }, []);

  const setLanguage = (lang: LanguageCode) => {
    setLanguageState(lang);
    localStorage.setItem("appLanguage", lang);

    // Set Google Translate cookie
    const gLang = lang.toLowerCase();
    
    // If English, clear the cookie to revert to original
    if (gLang === 'en') {
      document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
      document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; domain=.${window.location.hostname}; path=/;`;
    } else {
      document.cookie = `googtrans=/en/${gLang}; path=/`;
      document.cookie = `googtrans=/en/${gLang}; domain=.${window.location.hostname}; path=/`;
    }
    
    // Reload to apply translation safely without React hydration conflicts
    window.location.reload();
  };

  const t = (key: string) => {
    // We still provide the old t() for any static strings that rely on it, 
    // but Google Translate will translate the actual text node anyway.
    return translations[language][key] || translations["EN"][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {/* Hidden element required by Google Translate API — must NOT use display:none */}
      <div id="google_translate_element" style={{ position: "absolute", top: 0, left: 0, opacity: 0, pointerEvents: "none", height: 0, overflow: "hidden" }}></div>
      {children}
    </LanguageContext.Provider>
  );
};

declare global {
  interface Window {
    googleTranslateElementInit: () => void;
    google: any;
  }
}
