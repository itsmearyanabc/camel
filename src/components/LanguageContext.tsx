"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export type LanguageCode = "EN" | "RU" | "AR" | "TR" | "KK" | "UK";

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
    "reviews.submit": "Submit Review"
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
    "reviews.submit": "Отправить отзыв"
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
    "reviews.submit": "إرسال المراجعة"
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
    "reviews.submit": "Gönder"
  },
  KK: {
    "nav.shop": "Дүкен",
    "nav.wallet": "Әмиян",
    "nav.orders": "Тапсырыстар",
    "nav.tickets": "Билеттер",
    "nav.profile": "Профиль",
    "hero.subtitle": "◆ Жеке нарық",
    "hero.title": "Camel971 тәжірибесі, жетілдірілген.",
    "hero.desc": "Ыңғайлы сатып алудан ләззат алыңыз, қаражатыңызды қауіпсіз басқарыңыз және тапсырыстарды толық сеніммен қадағалаңыз.",
    "hero.dashboard": "Панельді ашу",
    "hero.create": "Тіркелу",
    "hero.signin": "Кіру",
    "relax.title": "Стрессті ұмытыңыз, демалыңыз және қалғанын бізге қалдырыңыз.",
    "relax.desc": "Біздің мінсіз процесіміз егжей-тегжейлер туралы алаңдамай уақытыңызды ләззат алуға кепілдік береді. Camel971 сізге ең тегіс тәжірибені ұсынуға рұқсат етіңіз.",
    "reviews.title": "Пікірлер",
    "reviews.anyType": "Кез келген түрі",
    "reviews.anyCity": "Кез келген қала",
    "reviews.anyProduct": "Кез келген өнім",
    "reviews.loadMore": "Толығырақ жүктеу",
    "reviews.write": "Пікір жазу",
    "reviews.login": "Пікір үшін кіріңіз",
    "reviews.submit": "Пікірді жіберу"
  },
  UK: {
    "nav.shop": "Магазин",
    "nav.wallet": "Гаманець",
    "nav.orders": "Замовлення",
    "nav.tickets": "Квитки",
    "nav.profile": "Профіль",
    "hero.subtitle": "◆ Приватний ринок",
    "hero.title": "Досвід Camel971, вдосконалений.",
    "hero.desc": "Насолоджуйтесь зручними покупками, безпечно керуйте своїми коштами та відстежуйте замовлення з повною впевненістю.",
    "hero.dashboard": "Відкрити панель",
    "hero.create": "Створити акаунт",
    "hero.signin": "Увійти",
    "relax.title": "Забудьте про стрес, розслабтеся і залиште все нам.",
    "relax.desc": "Наш бездоганний процес гарантує, що ви зможете насолоджуватися часом, не турбуючись про деталі. Дозвольте Camel971 забезпечити вам максимально комфортний досвід.",
    "reviews.title": "Відгуки",
    "reviews.anyType": "Будь-який тип",
    "reviews.anyCity": "Будь-яке місто",
    "reviews.anyProduct": "Будь-який товар",
    "reviews.loadMore": "Завантажити ще",
    "reviews.write": "Написати відгук",
    "reviews.login": "Увійдіть для відгуку",
    "reviews.submit": "Надіслати відгук"
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
    // IMPORTANT: Define the callback BEFORE injecting the script.
    // Google's script calls `googleTranslateElementInit` immediately on load.
    if (!document.getElementById("google-translate-script")) {
      window.googleTranslateElementInit = () => {
        new window.google.translate.TranslateElement(
          { pageLanguage: 'en', autoDisplay: false },
          'google_translate_element'
        );
      };

      const script = document.createElement("script");
      script.id = "google-translate-script";
      script.src = "//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  const setLanguage = (lang: LanguageCode) => {
    setLanguageState(lang);
    localStorage.setItem("appLanguage", lang);

    // Set Google Translate cookie
    const gLang = lang.toLowerCase();
    document.cookie = `googtrans=/en/${gLang}; path=/`;
    document.cookie = `googtrans=/en/${gLang}; domain=.${window.location.hostname}; path=/`;
    
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
