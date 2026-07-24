import React, { useState, useRef, useContext, createContext } from "react";
import {
  Search, Sparkles, Truck, Hammer, Wrench, BookOpen, PartyPopper, MoreHorizontal,
  Star, MapPin, ChevronRight, X, Check, User, Home, ClipboardList,
  MessageCircle, Send, Briefcase, TrendingUp, ThumbsUp, Clock, ShieldCheck, Globe, BadgeCheck,
} from "lucide-react";

/* ------------------------------- LANGUAGES -------------------------------- */

const LANGS = [
  { code: "nl", label: "Nederlands", locale: "nl-BE" },
  { code: "fr", label: "Français", locale: "fr-BE" },
  { code: "de", label: "Deutsch", locale: "de-DE" },
  { code: "en", label: "English", locale: "en-GB" },
  { code: "ar", label: "العربية", locale: "ar" },
  { code: "tr", label: "Türkçe", locale: "tr-TR" },
  { code: "ru", label: "Русский", locale: "ru-RU" },
  { code: "zh", label: "中文", locale: "zh-CN" },
];

const STRINGS = {
  nl: {
    previewingAs:"Bekijken als", roleCustomer:"Klant", rolePro:"Vakman",
    greeting:"Goedemiddag", heroTitle:"Wat wil je laten doen?", searchPlaceholder:"Zoek een dienst...",
    catAll:"Alles", trendingTitle:"Populair deze week", prosSuffix:"vakmensen",
    noServicesFound:"Geen diensten gevonden.", typicalPrice:"Typische prijs:",
    serviceBookNow:"Nu boeken", serviceGetQuotes:"Vraag gratis offertes aan",
    quoteFormTitle:"Vertel ons wat je nodig hebt", forService:"voor",
    whenLabel:"Wanneer moet dit gebeuren?", whenThisWeek:"Deze week", whenNextWeek:"Volgende week", whenFlexible:"Flexibel",
    detailsLabel:"Details", detailsPlaceholder:"Beschrijf de klus, grootte van de ruimte, alles wat een vakman moet weten...",
    budgetLabel:"Budget (optioneel)", budgetPlaceholder:"bv. 100", sendRequestBtn:"Verstuur aanvraag naar vakmensen",
    privacyNote:"Je contactgegevens blijven privé tot je een offerte aanvaardt.",
    myRequestsTitle:"Mijn aanvragen", noRequestsYet:"Nog geen aanvragen. Ga naar Ontdekken om een offerte aan te vragen.",
    waitingForQuotes:"Wachten op offertes...", quotesReceived:"offertes ontvangen",
    statusCollecting:"Offertes verzamelen", statusQuotesReady:"Offertes binnen", statusBooked:"Geboekt", statusCompleted:"Voltooid", statusReviewed:"Beoordeeld",
    waitingMsg:"Vakmensen bekijken je aanvraag. Offertes komen meestal binnen enkele minuten binnen.",
    quotesTitle:"Offertes", acceptQuoteBtn:"Aanvaard deze offerte", guaranteeNote:"Boeking beschermd onder onze garantie.",
    markCompleteBtn:"Markeer klus als voltooid", completeMsg:"Klus gemarkeerd als voltooid. Laat anderen weten hoe het ging.",
    leaveReviewBtn:"Laat een beoordeling achter", reviewTitle:"Beoordeel je ervaring", howDidItGo:"Hoe ging het?",
    submitReviewBtn:"Beoordeling versturen", defaultReviewText:"Prima service.",
    profileYou:"Jij", memberSince:"Lid sinds 2026", requestsSent:"Aanvragen verstuurd", jobsCompleted:"Klussen voltooid",
    yourReviews:"Jouw beoordelingen", noReviewsYet:"Nog geen beoordelingen.",
    messagesTitle:"Berichten", messagesEmpty:"Gesprekken met vakmensen verschijnen hier zodra je een offerte aanvaardt.",
    navDiscover:"Ontdekken", navRequests:"Aanvragen", navMessages:"Berichten", navProfile:"Profiel",
    proWelcome:"Welkom terug", statScore:"score", statReviewsLabel:"Beoordelingen", statResponseRate:"Reactiesnelheid",
    newLeadsTitle:"Nieuwe aanvragen die passen bij jouw diensten", noLeadsMsg:"Nog geen nieuwe aanvragen. Vraag als klant een dienst aan om er hier een te zien verschijnen.",
    newBadge:"Nieuw", budgetFlexible:"flexibel", sendQuoteBtn:"Stuur een offerte",
    sendQuoteTitle:"Verstuur je offerte", yourPriceLabel:"Jouw prijs", messageToCustomerLabel:"Bericht aan klant",
    sendQuoteSubmit:"Offerte versturen", defaultProMessage:"Graag geholpen \u2014 deze week beschikbaar, kan snel starten.",
    myJobsTitle:"Mijn klussen", segSent:"Verstuurd", segBooked:"Geboekt", segDone:"Klaar", nothingHereYet:"Nog niets hier.",
    yourQuoteLabel:"Jouw offerte:", noReviewYet:"Nog geen beoordeling",
    badgeWaiting:"In afwachting", badgeBooked:"Geboekt", badgeDone:"Voltooid",
    proJobsDone:"Klussen voltooid", proStatus:"Status", proServicesTitle:"Diensten die je aanbiedt",
    proFineprint:"Je ziet enkel aanvragen voor de diensten die je aanbiedt.",
    navDashboard:"Dashboard", navMyJobs:"Mijn klussen",
    toastBooked:"Geboekt! De vakman is op de hoogte gebracht.", toastThanks:"Bedankt voor je beoordeling!", toastQuoteSent:"Offerte verstuurd naar klant.",
    location:"Antwerpen", topRated:"Topbeoordeeld", elitePro:"Elite Pro",
    proTypeLabel:"Werkt als", proTypeFlexi:"Flexi-jobber", proTypeBusiness:"Geregistreerde onderneming",
    flexiTrackerTitle:"Flexi-job belastingvrije teller", flexiUsedOf:"gebruikt van",
    flexiThresholdNote:"Belgische belastingvrije grens voor flexi-jobs in 2026. Enkel demo \u2014 geen fiscaal advies.",
    platformFeeLabel:"Platformkosten", netPayoutLabel:"Netto uitbetaling aan vakman",
    boostTitle:"Zet je profiel in de kijker", boostDesc:"Krijg een 'Uitgelicht'-badge en verschijn bovenaan bij passende aanvragen, een week lang.",
    boostBtn:"Boost voor", boostActive:"Uitgelicht \u2014 actief deze week", boostBadge:"Uitgelicht",
    invoiceTitle:"Factuur", invoiceNote:"Enkel demo-document \u2014 geen wettelijk geldige factuur.",
    viewInvoiceBtn:"Bekijk factuur", invoiceSupplier:"Leverancier", invoiceCustomer:"Klant", invoiceService:"Dienst",
    invoiceAmount:"Bedrag excl. btw", invoiceVat:"Btw (21%)", invoiceTotal:"Totaal", invoiceRef:"Referentie",
    certifiedOnlyBadge:"Enkel erkende specialisten",
    flexiHiddenNote:"Opdrachten enkel voor erkende specialisten zijn verborgen zolang je als flexi-jobber staat ingesteld.",
  },
  fr: {
    previewingAs:"Aperçu en tant que", roleCustomer:"Client", rolePro:"Pro",
    greeting:"Bonjour", heroTitle:"De quoi as-tu besoin ?", searchPlaceholder:"Rechercher un service...",
    catAll:"Tout", trendingTitle:"Tendance cette semaine", prosSuffix:"professionnels",
    noServicesFound:"Aucun service ne correspond.", typicalPrice:"Prix habituel :",
    serviceBookNow:"Réserver", serviceGetQuotes:"Demander des devis gratuits",
    quoteFormTitle:"Dis-nous ce dont tu as besoin", forService:"pour",
    whenLabel:"Quand souhaites-tu que ce soit fait ?", whenThisWeek:"Cette semaine", whenNextWeek:"La semaine prochaine", whenFlexible:"Flexible",
    detailsLabel:"Détails", detailsPlaceholder:"Décris la tâche, la taille de l'espace, tout ce qu'un pro doit savoir...",
    budgetLabel:"Budget (facultatif)", budgetPlaceholder:"ex. 100", sendRequestBtn:"Envoyer la demande aux pros",
    privacyNote:"Tes coordonnées restent privées jusqu'à ce que tu acceptes un devis.",
    myRequestsTitle:"Mes demandes", noRequestsYet:"Aucune demande pour l'instant. Va dans Découvrir pour demander un devis.",
    waitingForQuotes:"En attente de devis...", quotesReceived:"devis reçus",
    statusCollecting:"Collecte des devis", statusQuotesReady:"Devis reçus", statusBooked:"Réservé", statusCompleted:"Terminé", statusReviewed:"Évalué",
    waitingMsg:"Les pros examinent ta demande. Les devis arrivent généralement en quelques minutes.",
    quotesTitle:"Devis", acceptQuoteBtn:"Accepter ce devis", guaranteeNote:"Réservation protégée par notre garantie.",
    markCompleteBtn:"Marquer comme terminé", completeMsg:"Tâche marquée comme terminée. Fais savoir aux autres comment cela s'est passé.",
    leaveReviewBtn:"Laisser un avis", reviewTitle:"Évalue ton expérience", howDidItGo:"Comment cela s'est-il passé ?",
    submitReviewBtn:"Envoyer l'avis", defaultReviewText:"Très bon service.",
    profileYou:"Toi", memberSince:"Membre depuis 2026", requestsSent:"Demandes envoyées", jobsCompleted:"Tâches terminées",
    yourReviews:"Tes avis", noReviewsYet:"Aucun avis pour l'instant.",
    messagesTitle:"Messages", messagesEmpty:"Les conversations avec les pros apparaîtront ici une fois qu'un devis est accepté.",
    navDiscover:"Découvrir", navRequests:"Demandes", navMessages:"Messages", navProfile:"Profil",
    proWelcome:"Bon retour", statScore:"note", statReviewsLabel:"Avis", statResponseRate:"Taux de réponse",
    newLeadsTitle:"Nouvelles demandes correspondant à tes services", noLeadsMsg:"Aucune nouvelle demande pour le moment. Fais une demande en tant que client pour en voir une apparaître ici.",
    newBadge:"Nouveau", budgetFlexible:"flexible", sendQuoteBtn:"Envoyer un devis",
    sendQuoteTitle:"Envoie ton devis", yourPriceLabel:"Ton prix", messageToCustomerLabel:"Message au client",
    sendQuoteSubmit:"Envoyer le devis", defaultProMessage:"Avec plaisir \u2014 disponible cette semaine, peut commencer rapidement.",
    myJobsTitle:"Mes tâches", segSent:"Envoyés", segBooked:"Réservés", segDone:"Terminés", nothingHereYet:"Rien ici pour l'instant.",
    yourQuoteLabel:"Ton devis :", noReviewYet:"Pas encore d'avis",
    badgeWaiting:"En attente", badgeBooked:"Réservé", badgeDone:"Terminé",
    proJobsDone:"Tâches terminées", proStatus:"Statut", proServicesTitle:"Services que tu proposes",
    proFineprint:"Tu ne vois que les demandes correspondant aux services que tu proposes.",
    navDashboard:"Tableau de bord", navMyJobs:"Mes tâches",
    toastBooked:"Réservé ! Le pro a été notifié.", toastThanks:"Merci pour ton avis !", toastQuoteSent:"Devis envoyé au client.",
    location:"Anvers", topRated:"Les mieux notés", elitePro:"Pro Elite",
    proTypeLabel:"Travaille en tant que", proTypeFlexi:"Flexi-jobbeur", proTypeBusiness:"Entreprise enregistrée",
    flexiTrackerTitle:"Compteur fiscal flexi-job", flexiUsedOf:"utilisé sur",
    flexiThresholdNote:"Plafond belge exonéré d'impôt pour les flexi-jobs en 2026. Démo uniquement \u2014 pas un conseil fiscal.",
    platformFeeLabel:"Frais de plateforme", netPayoutLabel:"Versement net au pro",
    boostTitle:"Mets ton profil en avant", boostDesc:"Obtiens un badge 'Sponsorisé' et apparais en premier dans les demandes correspondantes pendant une semaine.",
    boostBtn:"Booster pour", boostActive:"Sponsorisé \u2014 actif cette semaine", boostBadge:"Sponsorisé",
    invoiceTitle:"Facture", invoiceNote:"Document de démonstration uniquement \u2014 pas une facture légalement valable.",
    viewInvoiceBtn:"Voir la facture", invoiceSupplier:"Fournisseur", invoiceCustomer:"Client", invoiceService:"Service",
    invoiceAmount:"Montant hors TVA", invoiceVat:"TVA (21%)", invoiceTotal:"Total", invoiceRef:"Référence",
    certifiedOnlyBadge:"Réservé aux spécialistes agréés",
    flexiHiddenNote:"Les missions réservées aux spécialistes agréés sont masquées tant que tu es enregistré comme flexi-jobbeur.",
  },
  de: {
    previewingAs:"Vorschau als", roleCustomer:"Kunde", rolePro:"Profi",
    greeting:"Guten Tag", heroTitle:"Was möchtest du erledigen lassen?", searchPlaceholder:"Dienstleistung suchen...",
    catAll:"Alle", trendingTitle:"Beliebt diese Woche", prosSuffix:"Profis",
    noServicesFound:"Keine passenden Dienstleistungen gefunden.", typicalPrice:"Üblicher Preis:",
    serviceBookNow:"Jetzt buchen", serviceGetQuotes:"Kostenlose Angebote anfordern",
    quoteFormTitle:"Erzähl uns, was du brauchst", forService:"für",
    whenLabel:"Wann soll das erledigt werden?", whenThisWeek:"Diese Woche", whenNextWeek:"Nächste Woche", whenFlexible:"Flexibel",
    detailsLabel:"Details", detailsPlaceholder:"Beschreibe den Auftrag, die Raumgröße, alles was ein Profi wissen sollte...",
    budgetLabel:"Budget (optional)", budgetPlaceholder:"z.B. 100", sendRequestBtn:"Anfrage an Profis senden",
    privacyNote:"Deine Kontaktdaten bleiben privat, bis du ein Angebot annimmst.",
    myRequestsTitle:"Meine Anfragen", noRequestsYet:"Noch keine Anfragen. Gehe zu Entdecken, um ein Angebot anzufordern.",
    waitingForQuotes:"Warten auf Angebote...", quotesReceived:"Angebote erhalten",
    statusCollecting:"Angebote werden gesammelt", statusQuotesReady:"Angebote da", statusBooked:"Gebucht", statusCompleted:"Abgeschlossen", statusReviewed:"Bewertet",
    waitingMsg:"Profis prüfen deine Anfrage. Angebote treffen meist innerhalb weniger Minuten ein.",
    quotesTitle:"Angebote", acceptQuoteBtn:"Dieses Angebot annehmen", guaranteeNote:"Buchung durch unsere Garantie geschützt.",
    markCompleteBtn:"Als abgeschlossen markieren", completeMsg:"Auftrag als abgeschlossen markiert. Lass andere wissen, wie es gelaufen ist.",
    leaveReviewBtn:"Bewertung abgeben", reviewTitle:"Bewerte deine Erfahrung", howDidItGo:"Wie ist es gelaufen?",
    submitReviewBtn:"Bewertung absenden", defaultReviewText:"Sehr guter Service.",
    profileYou:"Du", memberSince:"Mitglied seit 2026", requestsSent:"Gesendete Anfragen", jobsCompleted:"Abgeschlossene Aufträge",
    yourReviews:"Deine Bewertungen", noReviewsYet:"Noch keine Bewertungen.",
    messagesTitle:"Nachrichten", messagesEmpty:"Gespräche mit Profis erscheinen hier, sobald du ein Angebot annimmst.",
    navDiscover:"Entdecken", navRequests:"Anfragen", navMessages:"Nachrichten", navProfile:"Profil",
    proWelcome:"Willkommen zurück", statScore:"Bewertung", statReviewsLabel:"Bewertungen", statResponseRate:"Antwortrate",
    newLeadsTitle:"Neue Anfragen passend zu deinen Diensten", noLeadsMsg:"Momentan keine neuen Anfragen. Stelle als Kunde eine Anfrage, um hier eine zu sehen.",
    newBadge:"Neu", budgetFlexible:"flexibel", sendQuoteBtn:"Angebot senden",
    sendQuoteTitle:"Sende dein Angebot", yourPriceLabel:"Dein Preis", messageToCustomerLabel:"Nachricht an Kunde",
    sendQuoteSubmit:"Angebot senden", defaultProMessage:"Gerne \u2014 diese Woche verfügbar, kann schnell starten.",
    myJobsTitle:"Meine Aufträge", segSent:"Gesendet", segBooked:"Gebucht", segDone:"Fertig", nothingHereYet:"Hier ist noch nichts.",
    yourQuoteLabel:"Dein Angebot:", noReviewYet:"Noch keine Bewertung",
    badgeWaiting:"Ausstehend", badgeBooked:"Gebucht", badgeDone:"Fertig",
    proJobsDone:"Erledigte Aufträge", proStatus:"Status", proServicesTitle:"Deine angebotenen Dienste",
    proFineprint:"Du siehst nur Anfragen für die Dienste, die du anbietest.",
    navDashboard:"Übersicht", navMyJobs:"Meine Aufträge",
    toastBooked:"Gebucht! Der Profi wurde benachrichtigt.", toastThanks:"Danke für deine Bewertung!", toastQuoteSent:"Angebot an Kunde gesendet.",
    location:"Antwerpen", topRated:"Bestbewertet", elitePro:"Elite-Profi",
    proTypeLabel:"Tätig als", proTypeFlexi:"Flexi-Jobber", proTypeBusiness:"Eingetragenes Unternehmen",
    flexiTrackerTitle:"Flexi-Job Steuerfrei-Tracker", flexiUsedOf:"genutzt von",
    flexiThresholdNote:"Belgische Steuerfreigrenze für Flexi-Jobs 2026. Nur Demo \u2014 keine Steuerberatung.",
    platformFeeLabel:"Plattformgebühr", netPayoutLabel:"Nettoauszahlung an Profi",
    boostTitle:"Profil hervorheben", boostDesc:"Erhalte ein 'Beworben'-Abzeichen und erscheine eine Woche lang zuerst bei passenden Anfragen.",
    boostBtn:"Boosten für", boostActive:"Beworben \u2014 diese Woche aktiv", boostBadge:"Beworben",
    invoiceTitle:"Rechnung", invoiceNote:"Nur Demo-Dokument \u2014 keine rechtsgültige Rechnung.",
    viewInvoiceBtn:"Rechnung ansehen", invoiceSupplier:"Lieferant", invoiceCustomer:"Kunde", invoiceService:"Dienstleistung",
    invoiceAmount:"Betrag exkl. MwSt.", invoiceVat:"MwSt. (21%)", invoiceTotal:"Gesamt", invoiceRef:"Referenz",
    certifiedOnlyBadge:"Nur für zertifizierte Fachleute",
    flexiHiddenNote:"Nur für Fachleute reservierte Aufträge sind ausgeblendet, solange du als Flexi-Jobber registriert bist.",
  },
  en: {
    previewingAs:"Previewing as", roleCustomer:"Customer", rolePro:"Pro",
    greeting:"Good afternoon", heroTitle:"What do you need done?", searchPlaceholder:"Search a service...",
    catAll:"All", trendingTitle:"Trending this week", prosSuffix:"pros",
    noServicesFound:"No services match that search.", typicalPrice:"Typical price:",
    serviceBookNow:"Book now", serviceGetQuotes:"Request free quotes",
    quoteFormTitle:"Tell us what you need", forService:"for",
    whenLabel:"When do you need this done?", whenThisWeek:"This week", whenNextWeek:"Next week", whenFlexible:"Flexible",
    detailsLabel:"Details", detailsPlaceholder:"Describe the job, size of space, anything a pro should know...",
    budgetLabel:"Budget (optional)", budgetPlaceholder:"e.g. 100", sendRequestBtn:"Send request to pros",
    privacyNote:"Your contact info stays private until you accept a quote.",
    myRequestsTitle:"My Requests", noRequestsYet:"No requests yet. Head to Discover to ask for a quote.",
    waitingForQuotes:"Waiting for quotes...", quotesReceived:"quotes received",
    statusCollecting:"Collecting quotes", statusQuotesReady:"Quotes ready", statusBooked:"Booked", statusCompleted:"Completed", statusReviewed:"Reviewed",
    waitingMsg:"Pros are reviewing your request. Quotes usually arrive within a few minutes.",
    quotesTitle:"Quotes", acceptQuoteBtn:"Accept this quote", guaranteeNote:"Booking protected under our guarantee.",
    markCompleteBtn:"Mark job as complete", completeMsg:"Job marked complete. Let others know how it went.",
    leaveReviewBtn:"Leave a review", reviewTitle:"Rate your experience", howDidItGo:"How did it go?",
    submitReviewBtn:"Submit review", defaultReviewText:"Great service.",
    profileYou:"You", memberSince:"Member since 2026", requestsSent:"Requests sent", jobsCompleted:"Jobs completed",
    yourReviews:"Your reviews", noReviewsYet:"No reviews yet.",
    messagesTitle:"Messages", messagesEmpty:"Conversations with pros will show up here once you accept a quote.",
    navDiscover:"Discover", navRequests:"Requests", navMessages:"Messages", navProfile:"Profile",
    proWelcome:"Welcome back", statScore:"rating", statReviewsLabel:"Reviews", statResponseRate:"Response rate",
    newLeadsTitle:"New leads matching your services", noLeadsMsg:"No new leads right now. Try requesting a service as a customer to see one appear here.",
    newBadge:"New", budgetFlexible:"flexible", sendQuoteBtn:"Send a quote",
    sendQuoteTitle:"Send your quote", yourPriceLabel:"Your price", messageToCustomerLabel:"Message to customer",
    sendQuoteSubmit:"Send quote", defaultProMessage:"Happy to help \u2014 available this week, can start fast.",
    myJobsTitle:"My Jobs", segSent:"Sent", segBooked:"Booked", segDone:"Done", nothingHereYet:"Nothing here yet.",
    yourQuoteLabel:"Your quote:", noReviewYet:"No review yet",
    badgeWaiting:"Waiting", badgeBooked:"Booked", badgeDone:"Complete",
    proJobsDone:"Jobs done", proStatus:"Status", proServicesTitle:"Services you offer",
    proFineprint:"You'll only see leads for the services you offer.",
    navDashboard:"Dashboard", navMyJobs:"My Jobs",
    toastBooked:"Booked! The pro has been notified.", toastThanks:"Thanks for your review!", toastQuoteSent:"Quote sent to customer.",
    location:"Antwerp", topRated:"Top Rated", elitePro:"Elite Pro",
    proTypeLabel:"Working as", proTypeFlexi:"Flexi-job worker", proTypeBusiness:"Registered business",
    flexiTrackerTitle:"Flexi-job tax-free tracker", flexiUsedOf:"used of",
    flexiThresholdNote:"Belgian flexi-job tax-free ceiling for 2026. Demo only \u2014 not tax advice.",
    platformFeeLabel:"Platform fee", netPayoutLabel:"Net payout to pro",
    boostTitle:"Boost your profile", boostDesc:"Get a Promoted badge and appear first in matching leads for a week.",
    boostBtn:"Boost for", boostActive:"Promoted \u2014 active this week", boostBadge:"Promoted",
    invoiceTitle:"Invoice", invoiceNote:"Demo document only \u2014 not a legally valid invoice.",
    viewInvoiceBtn:"View invoice", invoiceSupplier:"Supplier", invoiceCustomer:"Customer", invoiceService:"Service",
    invoiceAmount:"Amount excl. VAT", invoiceVat:"VAT (21%)", invoiceTotal:"Total", invoiceRef:"Reference",
    certifiedOnlyBadge:"Certified professionals only",
    flexiHiddenNote:"Certified-only jobs are hidden while you're registered as a flexi-job worker.",
  },
  ar: {
    previewingAs:"معاينة كـ", roleCustomer:"عميل", rolePro:"محترف",
    greeting:"مساء الخير", heroTitle:"ما الذي تحتاج إنجازه؟", searchPlaceholder:"ابحث عن خدمة...",
    catAll:"الكل", trendingTitle:"الأكثر طلبًا هذا الأسبوع", prosSuffix:"محترف",
    noServicesFound:"لا توجد خدمات مطابقة.", typicalPrice:"السعر المعتاد:",
    serviceBookNow:"احجز الآن", serviceGetQuotes:"اطلب عروض أسعار مجانية",
    quoteFormTitle:"أخبرنا بما تحتاجه", forService:"لخدمة",
    whenLabel:"متى تحتاج إنجاز هذا؟", whenThisWeek:"هذا الأسبوع", whenNextWeek:"الأسبوع القادم", whenFlexible:"مرن",
    detailsLabel:"التفاصيل", detailsPlaceholder:"صف العمل، حجم المكان، وأي شيء يجب أن يعرفه المحترف...",
    budgetLabel:"الميزانية (اختياري)", budgetPlaceholder:"مثال: 100", sendRequestBtn:"أرسل الطلب إلى المحترفين",
    privacyNote:"تبقى بيانات التواصل الخاصة بك سرية حتى تقبل عرضًا.",
    myRequestsTitle:"طلباتي", noRequestsYet:"لا توجد طلبات بعد. اذهب إلى استكشاف لطلب عرض سعر.",
    waitingForQuotes:"في انتظار العروض...", quotesReceived:"عرض تم استلامه",
    statusCollecting:"جمع العروض", statusQuotesReady:"العروض جاهزة", statusBooked:"محجوز", statusCompleted:"مكتمل", statusReviewed:"تم التقييم",
    waitingMsg:"يقوم المحترفون بمراجعة طلبك. عادةً ما تصل العروض خلال دقائق قليلة.",
    quotesTitle:"العروض", acceptQuoteBtn:"اقبل هذا العرض", guaranteeNote:"الحجز محمي بموجب ضمانتنا.",
    markCompleteBtn:"وضع علامة اكتمال العمل", completeMsg:"تم وضع علامة على العمل كمكتمل. أخبر الآخرين كيف سار الأمر.",
    leaveReviewBtn:"اترك تقييمًا", reviewTitle:"قيّم تجربتك", howDidItGo:"كيف سار الأمر؟",
    submitReviewBtn:"إرسال التقييم", defaultReviewText:"خدمة ممتازة.",
    profileYou:"أنت", memberSince:"عضو منذ 2026", requestsSent:"الطلبات المرسلة", jobsCompleted:"الأعمال المكتملة",
    yourReviews:"تقييماتك", noReviewsYet:"لا توجد تقييمات بعد.",
    messagesTitle:"الرسائل", messagesEmpty:"ستظهر المحادثات مع المحترفين هنا بمجرد قبولك لعرض سعر.",
    navDiscover:"استكشاف", navRequests:"الطلبات", navMessages:"الرسائل", navProfile:"الملف الشخصي",
    proWelcome:"مرحبًا بعودتك", statScore:"تقييم", statReviewsLabel:"التقييمات", statResponseRate:"معدل الاستجابة",
    newLeadsTitle:"طلبات جديدة تناسب خدماتك", noLeadsMsg:"لا توجد طلبات جديدة حاليًا. جرّب طلب خدمة كعميل لرؤيتها تظهر هنا.",
    newBadge:"جديد", budgetFlexible:"مرن", sendQuoteBtn:"أرسل عرض سعر",
    sendQuoteTitle:"أرسل عرض سعرك", yourPriceLabel:"سعرك", messageToCustomerLabel:"رسالة إلى العميل",
    sendQuoteSubmit:"إرسال العرض", defaultProMessage:"يسعدني المساعدة \u2014 متاح هذا الأسبوع، يمكنني البدء بسرعة.",
    myJobsTitle:"أعمالي", segSent:"مُرسَل", segBooked:"محجوز", segDone:"منتهٍ", nothingHereYet:"لا يوجد شيء هنا بعد.",
    yourQuoteLabel:"عرضك:", noReviewYet:"لا يوجد تقييم بعد",
    badgeWaiting:"قيد الانتظار", badgeBooked:"محجوز", badgeDone:"مكتمل",
    proJobsDone:"الأعمال المنجزة", proStatus:"الحالة", proServicesTitle:"الخدمات التي تقدمها",
    proFineprint:"سترى فقط الطلبات الخاصة بالخدمات التي تقدمها.",
    navDashboard:"لوحة التحكم", navMyJobs:"أعمالي",
    toastBooked:"تم الحجز! تم إخطار المحترف.", toastThanks:"شكرًا على تقييمك!", toastQuoteSent:"تم إرسال العرض إلى العميل.",
    location:"أنتويرب", topRated:"الأعلى تقييمًا", elitePro:"محترف النخبة",
    proTypeLabel:"يعمل كـ", proTypeFlexi:"عامل فليكسي جوب", proTypeBusiness:"شركة مسجلة",
    flexiTrackerTitle:"متتبع الإعفاء الضريبي لفليكسي جوب", flexiUsedOf:"مستخدم من",
    flexiThresholdNote:"السقف الضريبي المعفى في بلجيكا لعقود فليكسي جوب لعام 2026. للعرض فقط \u2014 وليس استشارة ضريبية.",
    platformFeeLabel:"رسوم المنصة", netPayoutLabel:"صافي المبلغ المدفوع للمحترف",
    boostTitle:"عزّز ملفك الشخصي", boostDesc:"احصل على شارة 'مُروَّج' وتصدّر الطلبات المطابقة لمدة أسبوع.",
    boostBtn:"عزّز مقابل", boostActive:"مُروَّج \u2014 نشط هذا الأسبوع", boostBadge:"مُروَّج",
    invoiceTitle:"الفاتورة", invoiceNote:"مستند تجريبي فقط \u2014 وليس فاتورة قانونية سارية.",
    viewInvoiceBtn:"عرض الفاتورة", invoiceSupplier:"المورّد", invoiceCustomer:"العميل", invoiceService:"الخدمة",
    invoiceAmount:"المبلغ دون ضريبة القيمة المضافة", invoiceVat:"ضريبة القيمة المضافة (21%)", invoiceTotal:"الإجمالي", invoiceRef:"المرجع",
    certifiedOnlyBadge:"للمتخصصين المعتمدين فقط",
    flexiHiddenNote:"المهام المخصصة للمعتمدين فقط مخفية طالما أنك مسجل كعامل فليكسي جوب.",
  },
  tr: {
    previewingAs:"Şu şekilde önizle", roleCustomer:"Müşteri", rolePro:"Profesyonel",
    greeting:"İyi günler", heroTitle:"Ne yaptırmak istiyorsun?", searchPlaceholder:"Bir hizmet ara...",
    catAll:"Tümü", trendingTitle:"Bu hafta trend olanlar", prosSuffix:"profesyonel",
    noServicesFound:"Bu aramayla eşleşen hizmet yok.", typicalPrice:"Ortalama fiyat:",
    serviceBookNow:"Şimdi rezervasyon yap", serviceGetQuotes:"Ücretsiz teklif al",
    quoteFormTitle:"İhtiyacını bize anlat", forService:"için",
    whenLabel:"Bunu ne zaman yaptırmak istiyorsun?", whenThisWeek:"Bu hafta", whenNextWeek:"Gelecek hafta", whenFlexible:"Esnek",
    detailsLabel:"Detaylar", detailsPlaceholder:"İşi, alanın büyüklüğünü ve bir profesyonelin bilmesi gerekenleri anlat...",
    budgetLabel:"Bütçe (isteğe bağlı)", budgetPlaceholder:"örn. 100", sendRequestBtn:"Profesyonellere talep gönder",
    privacyNote:"Bir teklifi kabul edene kadar iletişim bilgilerin gizli kalır.",
    myRequestsTitle:"Taleplerim", noRequestsYet:"Henüz talep yok. Teklif almak için Keşfet'e git.",
    waitingForQuotes:"Teklifler bekleniyor...", quotesReceived:"teklif alındı",
    statusCollecting:"Teklifler toplanıyor", statusQuotesReady:"Teklifler geldi", statusBooked:"Rezerve edildi", statusCompleted:"Tamamlandı", statusReviewed:"Değerlendirildi",
    waitingMsg:"Profesyoneller talebini inceliyor. Teklifler genellikle birkaç dakika içinde gelir.",
    quotesTitle:"Teklifler", acceptQuoteBtn:"Bu teklifi kabul et", guaranteeNote:"Rezervasyon garantimiz altında korunmaktadır.",
    markCompleteBtn:"İşi tamamlandı olarak işaretle", completeMsg:"İş tamamlandı olarak işaretlendi. Başkalarına nasıl gittiğini bildir.",
    leaveReviewBtn:"Bir değerlendirme bırak", reviewTitle:"Deneyimini değerlendir", howDidItGo:"Nasıl geçti?",
    submitReviewBtn:"Değerlendirmeyi gönder", defaultReviewText:"Harika hizmet.",
    profileYou:"Sen", memberSince:"2026'dan beri üye", requestsSent:"Gönderilen talepler", jobsCompleted:"Tamamlanan işler",
    yourReviews:"Senin değerlendirmelerin", noReviewsYet:"Henüz değerlendirme yok.",
    messagesTitle:"Mesajlar", messagesEmpty:"Bir teklifi kabul ettiğinde profesyonellerle olan sohbetler burada görünecek.",
    navDiscover:"Keşfet", navRequests:"Talepler", navMessages:"Mesajlar", navProfile:"Profil",
    proWelcome:"Tekrar hoş geldin", statScore:"puan", statReviewsLabel:"Değerlendirmeler", statResponseRate:"Yanıt oranı",
    newLeadsTitle:"Hizmetlerine uygun yeni talepler", noLeadsMsg:"Şu anda yeni talep yok. Burada bir tane görmek için müşteri olarak bir hizmet talep et.",
    newBadge:"Yeni", budgetFlexible:"esnek", sendQuoteBtn:"Teklif gönder",
    sendQuoteTitle:"Teklifini gönder", yourPriceLabel:"Fiyatın", messageToCustomerLabel:"Müşteriye mesaj",
    sendQuoteSubmit:"Teklifi gönder", defaultProMessage:"Yardımcı olmaktan mutluluk duyarım \u2014 bu hafta müsaitim, hızlı başlayabilirim.",
    myJobsTitle:"İşlerim", segSent:"Gönderildi", segBooked:"Rezerve", segDone:"Tamamlandı", nothingHereYet:"Burada henüz bir şey yok.",
    yourQuoteLabel:"Teklifin:", noReviewYet:"Henüz değerlendirme yok",
    badgeWaiting:"Bekleniyor", badgeBooked:"Rezerve", badgeDone:"Tamamlandı",
    proJobsDone:"Tamamlanan işler", proStatus:"Durum", proServicesTitle:"Sunduğun hizmetler",
    proFineprint:"Sadece sunduğun hizmetlere uygun talepleri görürsün.",
    navDashboard:"Panel", navMyJobs:"İşlerim",
    toastBooked:"Rezerve edildi! Profesyonel bilgilendirildi.", toastThanks:"Değerlendirmen için teşekkürler!", toastQuoteSent:"Teklif müşteriye gönderildi.",
    location:"Anvers", topRated:"En Çok Beğenilen", elitePro:"Elit Profesyonel",
    proTypeLabel:"Çalışma şekli", proTypeFlexi:"Flexi-job çalışanı", proTypeBusiness:"Kayıtlı işletme",
    flexiTrackerTitle:"Flexi-job vergiden muaf takip", flexiUsedOf:"kullanılan tutar /",
    flexiThresholdNote:"2026 için Belçika flexi-job vergiden muaf sınırı. Sadece demo \u2014 vergi tavsiyesi değildir.",
    platformFeeLabel:"Platform ücreti", netPayoutLabel:"Vakmana net ödeme",
    boostTitle:"Profilini öne çıkar", boostDesc:"'Öne Çıkan' rozeti al ve bir hafta boyunca uygun taleplerde ilk sırada görün.",
    boostBtn:"Öne çıkar:", boostActive:"Öne çıkarıldı \u2014 bu hafta aktif", boostBadge:"Öne Çıkan",
    invoiceTitle:"Fatura", invoiceNote:"Sadece demo belgesi \u2014 yasal geçerliliği olan bir fatura değildir.",
    viewInvoiceBtn:"Faturayı görüntüle", invoiceSupplier:"Tedarikçi", invoiceCustomer:"Müşteri", invoiceService:"Hizmet",
    invoiceAmount:"KDV hariç tutar", invoiceVat:"KDV (%21)", invoiceTotal:"Toplam", invoiceRef:"Referans",
    certifiedOnlyBadge:"Sadece sertifikalı uzmanlar",
    flexiHiddenNote:"Flexi-job çalışanı olarak kayıtlıyken sadece sertifikalı uzmanlara ait işler gizlenir.",
  },
  ru: {
    previewingAs:"Просмотр как", roleCustomer:"Клиент", rolePro:"Профи",
    greeting:"Добрый день", heroTitle:"Что нужно сделать?", searchPlaceholder:"Поиск услуги...",
    catAll:"Все", trendingTitle:"Популярно на этой неделе", prosSuffix:"специалистов",
    noServicesFound:"Услуги не найдены.", typicalPrice:"Обычная цена:",
    serviceBookNow:"Забронировать", serviceGetQuotes:"Запросить бесплатные предложения",
    quoteFormTitle:"Расскажите, что вам нужно", forService:"для",
    whenLabel:"Когда это нужно сделать?", whenThisWeek:"На этой неделе", whenNextWeek:"На следующей неделе", whenFlexible:"Гибко",
    detailsLabel:"Детали", detailsPlaceholder:"Опишите работу, размер помещения и всё, что должен знать специалист...",
    budgetLabel:"Бюджет (необязательно)", budgetPlaceholder:"напр. 100", sendRequestBtn:"Отправить запрос специалистам",
    privacyNote:"Ваши контактные данные останутся приватными, пока вы не примете предложение.",
    myRequestsTitle:"Мои запросы", noRequestsYet:"Пока нет запросов. Перейдите в раздел Найти, чтобы запросить предложение.",
    waitingForQuotes:"Ожидание предложений...", quotesReceived:"предложений получено",
    statusCollecting:"Сбор предложений", statusQuotesReady:"Предложения готовы", statusBooked:"Забронировано", statusCompleted:"Завершено", statusReviewed:"Оценено",
    waitingMsg:"Специалисты рассматривают ваш запрос. Предложения обычно приходят в течение нескольких минут.",
    quotesTitle:"Предложения", acceptQuoteBtn:"Принять это предложение", guaranteeNote:"Бронирование защищено нашей гарантией.",
    markCompleteBtn:"Отметить как выполненное", completeMsg:"Работа отмечена как выполненная. Расскажите другим, как всё прошло.",
    leaveReviewBtn:"Оставить отзыв", reviewTitle:"Оцените свой опыт", howDidItGo:"Как всё прошло?",
    submitReviewBtn:"Отправить отзыв", defaultReviewText:"Отличный сервис.",
    profileYou:"Вы", memberSince:"Участник с 2026", requestsSent:"Отправлено запросов", jobsCompleted:"Выполнено работ",
    yourReviews:"Ваши отзывы", noReviewsYet:"Пока нет отзывов.",
    messagesTitle:"Сообщения", messagesEmpty:"Переписка со специалистами появится здесь после принятия предложения.",
    navDiscover:"Найти", navRequests:"Запросы", navMessages:"Сообщения", navProfile:"Профиль",
    proWelcome:"С возвращением", statScore:"рейтинг", statReviewsLabel:"Отзывы", statResponseRate:"Скорость ответа",
    newLeadsTitle:"Новые заявки по вашим услугам", noLeadsMsg:"Сейчас нет новых заявок. Попробуйте оставить запрос как клиент, чтобы увидеть его здесь.",
    newBadge:"Новое", budgetFlexible:"гибкий", sendQuoteBtn:"Отправить предложение",
    sendQuoteTitle:"Отправьте своё предложение", yourPriceLabel:"Ваша цена", messageToCustomerLabel:"Сообщение клиенту",
    sendQuoteSubmit:"Отправить предложение", defaultProMessage:"С радостью помогу \u2014 свободен на этой неделе, могу начать быстро.",
    myJobsTitle:"Мои работы", segSent:"Отправлено", segBooked:"Забронировано", segDone:"Готово", nothingHereYet:"Здесь пока пусто.",
    yourQuoteLabel:"Ваше предложение:", noReviewYet:"Пока нет отзыва",
    badgeWaiting:"Ожидание", badgeBooked:"Забронировано", badgeDone:"Завершено",
    proJobsDone:"Выполнено работ", proStatus:"Статус", proServicesTitle:"Услуги, которые вы предлагаете",
    proFineprint:"Вы будете видеть только заявки по услугам, которые предлагаете.",
    navDashboard:"Панель", navMyJobs:"Мои работы",
    toastBooked:"Забронировано! Специалист уведомлён.", toastThanks:"Спасибо за отзыв!", toastQuoteSent:"Предложение отправлено клиенту.",
    location:"Антверпен", topRated:"Лучшие оценки", elitePro:"Элитный специалист",
    proTypeLabel:"Работает как", proTypeFlexi:"Флекси-джоб работник", proTypeBusiness:"Зарегистрированный бизнес",
    flexiTrackerTitle:"Счётчик необлагаемого дохода флекси-джоб", flexiUsedOf:"использовано из",
    flexiThresholdNote:"Бельгийский необлагаемый налогом порог для флекси-джобов на 2026 год. Только демо \u2014 не налоговая консультация.",
    platformFeeLabel:"Комиссия платформы", netPayoutLabel:"Чистая выплата специалисту",
    boostTitle:"Продвиньте свой профиль", boostDesc:"Получите значок «Продвигается» и будьте первым в подходящих заявках в течение недели.",
    boostBtn:"Продвинуть за", boostActive:"Продвигается \u2014 активно на этой неделе", boostBadge:"Продвигается",
    invoiceTitle:"Счёт-фактура", invoiceNote:"Только демонстрационный документ \u2014 не имеет юридической силы.",
    viewInvoiceBtn:"Посмотреть счёт", invoiceSupplier:"Поставщик", invoiceCustomer:"Клиент", invoiceService:"Услуга",
    invoiceAmount:"Сумма без НДС", invoiceVat:"НДС (21%)", invoiceTotal:"Итого", invoiceRef:"Номер",
    certifiedOnlyBadge:"Только для сертифицированных специалистов",
    flexiHiddenNote:"Заказы только для сертифицированных специалистов скрыты, пока вы зарегистрированы как флекси-джоб работник.",
  },
  zh: {
    previewingAs:"预览身份", roleCustomer:"客户", rolePro:"专业人士",
    greeting:"下午好", heroTitle:"你需要什么服务？", searchPlaceholder:"搜索服务...",
    catAll:"全部", trendingTitle:"本周热门", prosSuffix:"位专业人士",
    noServicesFound:"没有找到匹配的服务。", typicalPrice:"参考价格：",
    serviceBookNow:"立即预订", serviceGetQuotes:"免费获取报价",
    quoteFormTitle:"告诉我们你的需求", forService:"针对",
    whenLabel:"你希望什么时候完成？", whenThisWeek:"本周", whenNextWeek:"下周", whenFlexible:"时间灵活",
    detailsLabel:"详情", detailsPlaceholder:"描述工作内容、空间大小，以及专业人士需要知道的一切...",
    budgetLabel:"预算（可选）", budgetPlaceholder:"例如 100", sendRequestBtn:"发送请求给专业人士",
    privacyNote:"在你接受报价之前，你的联系方式将保密。",
    myRequestsTitle:"我的请求", noRequestsYet:"还没有请求。前往发现页面获取报价。",
    waitingForQuotes:"等待报价中...", quotesReceived:"个报价已收到",
    statusCollecting:"正在收集报价", statusQuotesReady:"报价已就绪", statusBooked:"已预订", statusCompleted:"已完成", statusReviewed:"已评价",
    waitingMsg:"专业人士正在查看你的请求。报价通常在几分钟内送达。",
    quotesTitle:"报价", acceptQuoteBtn:"接受此报价", guaranteeNote:"此预订受我们的保障计划保护。",
    markCompleteBtn:"标记为已完成", completeMsg:"工作已标记为完成。告诉大家你的体验如何。",
    leaveReviewBtn:"发表评价", reviewTitle:"评价你的体验", howDidItGo:"这次体验如何？",
    submitReviewBtn:"提交评价", defaultReviewText:"服务非常好。",
    profileYou:"你", memberSince:"2026年加入", requestsSent:"已发送请求", jobsCompleted:"已完成工作",
    yourReviews:"你的评价", noReviewsYet:"还没有评价。",
    messagesTitle:"消息", messagesEmpty:"一旦你接受报价，与专业人士的对话将显示在这里。",
    navDiscover:"发现", navRequests:"请求", navMessages:"消息", navProfile:"我的",
    proWelcome:"欢迎回来", statScore:"评分", statReviewsLabel:"评价数", statResponseRate:"响应率",
    newLeadsTitle:"符合你服务范围的新需求", noLeadsMsg:"目前没有新需求。以客户身份发起一个请求，即可在此看到。",
    newBadge:"新", budgetFlexible:"灵活", sendQuoteBtn:"发送报价",
    sendQuoteTitle:"发送你的报价", yourPriceLabel:"你的价格", messageToCustomerLabel:"给客户的留言",
    sendQuoteSubmit:"发送报价", defaultProMessage:"很乐意帮忙 \u2014 本周有空，可以尽快开始。",
    myJobsTitle:"我的工作", segSent:"已发送", segBooked:"已预订", segDone:"已完成", nothingHereYet:"这里暂时还没有内容。",
    yourQuoteLabel:"你的报价：", noReviewYet:"还没有评价",
    badgeWaiting:"待处理", badgeBooked:"已预订", badgeDone:"已完成",
    proJobsDone:"已完成工作", proStatus:"状态", proServicesTitle:"你提供的服务",
    proFineprint:"你只会看到与你所提供服务相符的需求。",
    navDashboard:"仪表盘", navMyJobs:"我的工作",
    toastBooked:"已预订！专业人士已收到通知。", toastThanks:"感谢你的评价！", toastQuoteSent:"报价已发送给客户。",
    location:"安特卫普", topRated:"五星好评", elitePro:"精英专业人士",
    proTypeLabel:"工作身份", proTypeFlexi:"灵活工作者（Flexi-job）", proTypeBusiness:"注册企业",
    flexiTrackerTitle:"Flexi-job 免税额度追踪", flexiUsedOf:"已使用",
    flexiThresholdNote:"2026年比利时 flexi-job 免税上限。仅供演示 \u2014 非税务建议。",
    platformFeeLabel:"平台服务费", netPayoutLabel:"专业人士实得金额",
    boostTitle:"提升你的资料曝光度", boostDesc:"获得「推广」标签，在匹配的需求中优先展示一周。",
    boostBtn:"推广，费用", boostActive:"推广中 \u2014 本周生效", boostBadge:"推广",
    invoiceTitle:"发票", invoiceNote:"仅供演示的文件 \u2014 不具备法律效力。",
    viewInvoiceBtn:"查看发票", invoiceSupplier:"供应商", invoiceCustomer:"客户", invoiceService:"服务",
    invoiceAmount:"不含增值税金额", invoiceVat:"增值税 (21%)", invoiceTotal:"总计", invoiceRef:"参考编号",
    certifiedOnlyBadge:"仅限认证专业人士",
    flexiHiddenNote:"当你以 flexi-job 身份注册时，仅限认证专业人士的工作将被隐藏。",
  },
};

/* ---------------------------------- DATA ---------------------------------- */

const CATS = [
  { id: "cleaning", icon: Sparkles },
  { id: "moving", icon: Truck },
  { id: "renovation", icon: Hammer },
  { id: "repair", icon: Wrench },
  { id: "tutoring", icon: BookOpen },
  { id: "events", icon: PartyPopper },
  { id: "specialist", icon: BadgeCheck },
  { id: "other", icon: MoreHorizontal },
];

const CAT_I18N = {
  nl:{cleaning:"Schoonmaak",moving:"Verhuizing",renovation:"Renovatie",repair:"Herstelling",tutoring:"Bijles",events:"Evenementen",specialist:"Specialisten",other:"Overig"},
  fr:{cleaning:"Nettoyage",moving:"Déménagement",renovation:"Rénovation",repair:"Réparation",tutoring:"Cours particuliers",events:"Événements",specialist:"Spécialistes",other:"Autre"},
  de:{cleaning:"Reinigung",moving:"Umzug",renovation:"Renovierung",repair:"Reparatur",tutoring:"Nachhilfe",events:"Veranstaltungen",specialist:"Spezialisten",other:"Sonstiges"},
  en:{cleaning:"Cleaning",moving:"Moving",renovation:"Renovation",repair:"Repair",tutoring:"Tutoring",events:"Events",specialist:"Specialists",other:"Other"},
  ar:{cleaning:"تنظيف",moving:"نقل",renovation:"تجديد",repair:"إصلاح",tutoring:"دروس خصوصية",events:"مناسبات",specialist:"متخصصون",other:"أخرى"},
  tr:{cleaning:"Temizlik",moving:"Nakliyat",renovation:"Tadilat",repair:"Tamir",tutoring:"Özel Ders",events:"Organizasyon",specialist:"Uzmanlar",other:"Diğer"},
  ru:{cleaning:"Уборка",moving:"Переезд",renovation:"Ремонт",repair:"Починка",tutoring:"Репетиторство",events:"Мероприятия",specialist:"Специалисты",other:"Другое"},
  zh:{cleaning:"清洁",moving:"搬家",renovation:"装修",repair:"维修",tutoring:"家教",events:"活动策划",specialist:"专业认证服务",other:"其他"},
};

const BASE_SERVICES = [
  { id:"s1", cat:"renovation", pros:1842, rating:4.8, reviews:12163, mode:"quote", base:320 },
  { id:"s2", cat:"moving", pros:604, rating:4.9, reviews:19700, mode:"quote", base:480 },
  { id:"s3", cat:"cleaning", pros:1995, rating:4.6, reviews:41042, mode:"book", base:65 },
  { id:"s4", cat:"cleaning", pros:1230, rating:4.6, reviews:4683, mode:"quote", base:90 },
  { id:"s5", cat:"renovation", pros:1091, rating:4.6, reviews:1187, mode:"quote", base:1500 },
  { id:"s6", cat:"repair", pros:1425, rating:4.7, reviews:2370, mode:"quote", base:210 },
  { id:"s7", cat:"moving", pros:1222, rating:4.9, reviews:6542, mode:"quote", base:90 },
  { id:"s8", cat:"tutoring", pros:639, rating:4.9, reviews:1718, mode:"quote", base:35 },
  { id:"s9", cat:"repair", pros:1367, rating:4.8, reviews:3079, mode:"quote", base:70 },
  { id:"s10", cat:"cleaning", pros:730, rating:4.9, reviews:7468, mode:"quote", base:55 },
  { id:"s11", cat:"repair", pros:1104, rating:4.7, reviews:15420, mode:"quote", base:120 },
  { id:"s12", cat:"specialist", pros:340, rating:4.8, reviews:890, mode:"quote", base:150, certifiedOnly:true },
  { id:"s13", cat:"specialist", pros:512, rating:4.9, reviews:2210, mode:"quote", base:60, certifiedOnly:true },
  { id:"s14", cat:"specialist", pros:210, rating:4.8, reviews:640, mode:"quote", base:450, certifiedOnly:true },
  { id:"s15", cat:"specialist", pros:380, rating:4.9, reviews:1340, mode:"quote", base:90, certifiedOnly:true },
];

const SERVICE_I18N = {
  nl:{ s1:{name:"Schilderwerken",blurb:"Binnen- en buitenschilderwerk, muurvoorbereiding en afwerking door erkende schilders."}, s2:{name:"Verhuisservice",blurb:"Volledige verhuizingen inclusief inpakken, dragen en transport."}, s3:{name:"Woningreiniging",blurb:"Terugkerende of eenmalige grondige schoonmaak voor appartement of huis."}, s4:{name:"Ontruimingsschoonmaak",blurb:"Schoonmaak bij verhuis zodat je je waarborg zonder stress terugkrijgt."}, s5:{name:"Keukenkasten op maat",blurb:"Keukenkasten op maat gemeten en gebouwd voor jouw ruimte."}, s6:{name:"Tegelwerken",blurb:"Vloer- en wandtegels voor badkamer, keuken en terras."}, s7:{name:"Meubeltransport",blurb:"Transport van losse meubels of toestellen, ook kleine ladingen."}, s8:{name:"Engelse bijles (online)",blurb:"1-op-1 online Engelse les op elk niveau, op een moment dat jou past."}, s9:{name:"Elektriciteitswerken",blurb:"Bekabeling, stopcontacten, verlichting en veiligheidscontroles door erkende elektriciens."}, s10:{name:"Zetel- en tapijtreiniging",blurb:"Stoom- en dieptereiniging voor zetels, fauteuils en matrassen."}, s11:{name:"Loodgieterswerken",blurb:"Lekkages, leidingwerk en sanitaire installaties door erkende loodgieters."}, s12:{name:"Juridisch advies voor buitenlanders",blurb:"Hulp bij verblijfsvergunningen, contracten en administratieve procedures door erkende juristen."}, s13:{name:"Beëdigde vertaling",blurb:"Officiële vertaling van documenten voor overheidsinstanties, erkend door de rechtbank."}, s14:{name:"Asbestverwijdering",blurb:"Veilige, wettelijk erkende verwijdering en afvoer van asbesthoudend materiaal."}, s15:{name:"EPC-certificatie",blurb:"Verplicht energieprestatiecertificaat opgesteld door een erkende EPC-deskundige."} },
  fr:{ s1:{name:"Travaux de peinture",blurb:"Peinture intérieure et extérieure, préparation des murs et finitions par des peintres agréés."}, s2:{name:"Service de déménagement",blurb:"Déménagements complets incluant emballage, portage et transport."}, s3:{name:"Nettoyage de maison",blurb:"Nettoyage récurrent ou ponctuel pour appartement ou maison."}, s4:{name:"Nettoyage de fin de bail",blurb:"Nettoyage lors d'un déménagement pour récupérer ta garantie sans stress."}, s5:{name:"Cuisine sur mesure",blurb:"Meubles de cuisine mesurés et construits sur mesure pour ton espace."}, s6:{name:"Carrelage",blurb:"Carrelage sol et mur pour salle de bain, cuisine et terrasse."}, s7:{name:"Transport de meubles",blurb:"Transport de meubles ou d'appareils isolés, même en petite quantité."}, s8:{name:"Cours d'anglais (en ligne)",blurb:"Cours particuliers d'anglais en ligne à tous les niveaux, à ton rythme."}, s9:{name:"Travaux d'électricité",blurb:"Câblage, prises, luminaires et contrôles de sécurité par des électriciens agréés."}, s10:{name:"Nettoyage canapé et tapis",blurb:"Nettoyage vapeur en profondeur pour canapés, fauteuils et matelas."}, s11:{name:"Plomberie",blurb:"Fuites, tuyauterie et installations sanitaires par des plombiers agréés."}, s12:{name:"Conseil juridique pour étrangers",blurb:"Aide pour permis de séjour, contrats et démarches administratives par des juristes agréés."}, s13:{name:"Traduction assermentée",blurb:"Traduction officielle de documents pour les administrations, agréée par le tribunal."}, s14:{name:"Désamiantage",blurb:"Enlèvement et évacuation sécurisés et agréés des matériaux contenant de l'amiante."}, s15:{name:"Certification PEB",blurb:"Certificat de performance énergétique obligatoire établi par un expert agréé."} },
  de:{ s1:{name:"Malerarbeiten",blurb:"Innen- und Außenanstrich, Wandvorbereitung und Ausführung durch geprüfte Maler."}, s2:{name:"Umzugsservice",blurb:"Komplette Umzüge inklusive Verpacken, Tragen und Transport."}, s3:{name:"Wohnungsreinigung",blurb:"Wiederkehrende oder einmalige Tiefenreinigung für Wohnung oder Haus."}, s4:{name:"Endreinigung",blurb:"Reinigung beim Auszug, damit du deine Kaution stressfrei zurückbekommst."}, s5:{name:"Küchenschränke nach Maß",blurb:"Maßgeschneiderte Küchenschränke, vermessen und gebaut für deinen Raum."}, s6:{name:"Fliesenarbeiten",blurb:"Boden- und Wandfliesen für Bad, Küche und Terrasse."}, s7:{name:"Möbeltransport",blurb:"Transport einzelner Möbel oder Geräte, auch kleine Ladungen."}, s8:{name:"Englisch-Nachhilfe (online)",blurb:"1:1-Online-Englischunterricht für jedes Niveau, zeitlich flexibel."}, s9:{name:"Elektroarbeiten",blurb:"Verkabelung, Steckdosen, Beleuchtung und Sicherheitsprüfungen durch geprüfte Elektriker."}, s10:{name:"Sofa- und Teppichreinigung",blurb:"Dampf- und Tiefenreinigung für Sofas, Sessel und Matratzen."}, s11:{name:"Klempnerarbeiten",blurb:"Lecks, Rohrleitungen und Sanitärinstallationen durch geprüfte Klempner."}, s12:{name:"Rechtsberatung für Ausländer",blurb:"Unterstützung bei Aufenthaltstiteln, Verträgen und Behördengängen durch zugelassene Juristen."}, s13:{name:"Beglaubigte Übersetzung",blurb:"Amtlich anerkannte Übersetzung von Dokumenten für Behörden."}, s14:{name:"Asbestsanierung",blurb:"Sichere, behördlich zugelassene Entfernung und Entsorgung asbesthaltiger Materialien."}, s15:{name:"EPC-Zertifizierung",blurb:"Vorgeschriebener Energieausweis, erstellt von einem zugelassenen Sachverständigen."} },
  en:{ s1:{name:"Painting & Whitewash",blurb:"Interior/exterior painting, wall prep, and touch-ups from vetted painters."}, s2:{name:"Moving Service",blurb:"Full household moves with packing, loading, and transport."}, s3:{name:"Home Cleaning",blurb:"Recurring or one-off deep cleans for apartments and houses."}, s4:{name:"Move-out Cleaning",blurb:"End-of-tenancy cleaning to get your deposit back, stress-free."}, s5:{name:"Custom Kitchen Cabinets",blurb:"Bespoke kitchen cabinetry, measured and built for your space."}, s6:{name:"Tiling",blurb:"Floor and wall tiling for bathrooms, kitchens, and terraces."}, s7:{name:"Furniture Moving",blurb:"Single-item or small-load transport for furniture and appliances."}, s8:{name:"English Tutoring (Online)",blurb:"1:1 online English lessons for any level, scheduled around you."}, s9:{name:"Electrical Work",blurb:"Wiring, outlets, fixtures, and safety checks by licensed electricians."}, s10:{name:"Sofa & Carpet Cleaning",blurb:"Steam and deep-clean for sofas, armchairs, and mattresses."}, s11:{name:"Plumbing",blurb:"Leaks, pipework, and sanitary installations from licensed plumbers."}, s12:{name:"Legal Advice for Foreigners",blurb:"Help with residence permits, contracts, and administrative procedures from licensed legal advisors."}, s13:{name:"Certified Translation",blurb:"Official, court-recognised translation of documents for government procedures."}, s14:{name:"Asbestos Removal",blurb:"Safe, legally certified removal and disposal of asbestos-containing materials."}, s15:{name:"EPC Certification",blurb:"Mandatory energy performance certificate prepared by a licensed EPC assessor."} },
  ar:{ s1:{name:"أعمال الدهان",blurb:"دهان داخلي وخارجي، تحضير الجدران واللمسات الأخيرة من قبل دهانين معتمدين."}, s2:{name:"خدمة النقل",blurb:"نقل كامل للمنزل يشمل التغليف والحمل والنقل."}, s3:{name:"تنظيف المنزل",blurb:"تنظيف عميق متكرر أو لمرة واحدة للشقق والمنازل."}, s4:{name:"تنظيف الإخلاء",blurb:"تنظيف عند الانتقال لاسترجاع تأمينك دون أي إزعاج."}, s5:{name:"خزائن مطبخ حسب الطلب",blurb:"خزائن مطبخ مقاسة ومصنوعة خصيصًا لمساحتك."}, s6:{name:"أعمال البلاط",blurb:"تركيب بلاط الأرضيات والجدران للحمامات والمطابخ والشرفات."}, s7:{name:"نقل الأثاث",blurb:"نقل قطعة أثاث واحدة أو حمولة صغيرة للأثاث والأجهزة."}, s8:{name:"دروس اللغة الإنجليزية (عبر الإنترنت)",blurb:"دروس فردية عبر الإنترنت لجميع المستويات، بمواعيد تناسبك."}, s9:{name:"أعمال الكهرباء",blurb:"أسلاك، مقابس، تركيبات، وفحوصات سلامة من قبل كهربائيين معتمدين."}, s10:{name:"تنظيف الأرائك والسجاد",blurb:"تنظيف بالبخار وتنظيف عميق للأرائك والكراسي والمراتب."}, s11:{name:"أعمال السباكة",blurb:"تسريبات، أنابيب، وتركيبات صحية من قبل سباكين مرخّصين."}, s12:{name:"استشارات قانونية للأجانب",blurb:"مساعدة في تصاريح الإقامة والعقود والإجراءات الإدارية من قبل مستشارين قانونيين مرخّصين."}, s13:{name:"ترجمة معتمدة",blurb:"ترجمة رسمية للمستندات معتمدة من المحكمة للإجراءات الحكومية."}, s14:{name:"إزالة الأسبستوس",blurb:"إزالة والتخلص الآمن والمعتمد قانونيًا من المواد المحتوية على الأسبستوس."}, s15:{name:"شهادة الأداء الطاقي (EPC)",blurb:"شهادة الأداء الطاقي الإلزامية يعدها خبير معتمد."} },
  tr:{ s1:{name:"Boya Badana",blurb:"Onaylı ustalar tarafından iç/dış boya, duvar hazırlığı ve rötuş."}, s2:{name:"Nakliyat Hizmeti",blurb:"Paketleme, taşıma ve nakliye dahil komple ev taşımacılığı."}, s3:{name:"Ev Temizliği",blurb:"Daire ve evler için tekrarlayan veya tek seferlik detaylı temizlik."}, s4:{name:"Boş Ev Temizliği",blurb:"Depozitonu sorunsuzca geri almak için çıkış temizliği."}, s5:{name:"Özel Mutfak Dolabı",blurb:"Mekanına özel ölçülüp yapılan mutfak dolapları."}, s6:{name:"Fayans Döşeme",blurb:"Banyo, mutfak ve teras için zemin ve duvar fayansı."}, s7:{name:"Eşya Taşıma",blurb:"Tek parça eşya veya küçük yük taşımacılığı."}, s8:{name:"İngilizce Özel Ders (Online)",blurb:"Her seviyeye uygun, sana uygun saatlerde birebir online İngilizce dersi."}, s9:{name:"Elektrik İşleri",blurb:"Lisanslı elektrikçiler tarafından kablolama, priz, aydınlatma ve güvenlik kontrolü."}, s10:{name:"Koltuk ve Halı Yıkama",blurb:"Koltuk, berjer ve yatak için buharla derin temizlik."}, s11:{name:"Su Tesisatı",blurb:"Lisanslı tesisatçılar tarafından kaçak, boru döşeme ve sıhhi tesisat işleri."}, s12:{name:"Yabancılar için Hukuki Danışmanlık",blurb:"Lisanslı hukuk danışmanlarından oturma izni, sözleşmeler ve idari işlemler konusunda destek."}, s13:{name:"Yeminli Tercüme",blurb:"Resmi kurumlar için mahkemece onaylı belge tercümesi."}, s14:{name:"Asbest Sökümü",blurb:"Asbest içeren malzemelerin güvenli ve yasal olarak onaylı şekilde sökülmesi ve bertarafı."}, s15:{name:"EPC Sertifikası",blurb:"Lisanslı bir uzman tarafından hazırlanan zorunlu enerji performans sertifikası."} },
  ru:{ s1:{name:"Малярные работы",blurb:"Внутренняя и наружная покраска, подготовка стен и отделка проверенными мастерами."}, s2:{name:"Служба переезда",blurb:"Полный переезд с упаковкой, погрузкой и транспортировкой."}, s3:{name:"Уборка дома",blurb:"Регулярная или разовая глубокая уборка квартир и домов."}, s4:{name:"Уборка при выезде",blurb:"Уборка при переезде, чтобы без стресса вернуть залог."}, s5:{name:"Кухонные шкафы на заказ",blurb:"Кухонная мебель, изготовленная по индивидуальным размерам."}, s6:{name:"Укладка плитки",blurb:"Напольная и настенная плитка для ванной, кухни и террасы."}, s7:{name:"Перевозка мебели",blurb:"Перевозка отдельных предметов мебели или техники, даже небольших грузов."}, s8:{name:"Репетитор по английскому (онлайн)",blurb:"Индивидуальные онлайн-уроки английского для любого уровня, в удобное время."}, s9:{name:"Электромонтажные работы",blurb:"Проводка, розетки, освещение и проверка безопасности лицензированными электриками."}, s10:{name:"Химчистка дивана и ковров",blurb:"Паровая глубокая чистка диванов, кресел и матрасов."}, s11:{name:"Сантехнические работы",blurb:"Утечки, трубопроводы и сантехнические установки от лицензированных сантехников."}, s12:{name:"Юридическая консультация для иностранцев",blurb:"Помощь с видом на жительство, договорами и административными процедурами от лицензированных юристов."}, s13:{name:"Заверенный перевод",blurb:"Официальный, признанный судом перевод документов для государственных процедур."}, s14:{name:"Удаление асбеста",blurb:"Безопасное, юридически сертифицированное удаление и утилизация асбестосодержащих материалов."}, s15:{name:"Сертификация EPC",blurb:"Обязательный сертификат энергоэффективности, подготовленный лицензированным экспертом."} },
  zh:{ s1:{name:"油漆粉刷",blurb:"由认证油漆工提供的室内外油漆、墙面处理及修补。"}, s2:{name:"搬家服务",blurb:"包含打包、搬运和运输的全套搬家服务。"}, s3:{name:"住宅清洁",blurb:"为公寓和住宅提供定期或一次性深度清洁。"}, s4:{name:"退租清洁",blurb:"搬家时的清洁服务，助你无忧拿回押金。"}, s5:{name:"定制厨柜",blurb:"根据你的空间量身定制并安装的厨房橱柜。"}, s6:{name:"贴砖服务",blurb:"卫生间、厨房和露台的地砖与墙砖铺贴。"}, s7:{name:"家具搬运",blurb:"单件家具或小件货物及电器的运输。"}, s8:{name:"英语家教（在线）",blurb:"适合任何水平的一对一在线英语课程，时间灵活安排。"}, s9:{name:"电气维修",blurb:"由持证电工提供的布线、插座、灯具安装及安全检查。"}, s10:{name:"沙发地毯清洗",blurb:"沙发、扶手椅和床垫的蒸汽深度清洁。"}, s11:{name:"水管维修",blurb:"由持证水管工提供的漏水处理、管道及卫浴安装服务。"}, s12:{name:"外籍人士法律咨询",blurb:"由持证法律顾问提供居留许可、合同及行政手续方面的协助。"}, s13:{name:"认证翻译",blurb:"面向政府手续的官方文件翻译，经法院认可。"}, s14:{name:"石棉清除",blurb:"安全、具备法定资质的石棉材料清除与处理服务。"}, s15:{name:"EPC能效认证",blurb:"由持证EPC评估师出具的强制性能效证书。"} },
};

const BASE_PROS = [
  { id:"p1", cats:["cleaning","repair"], rating:4.8, reviews:342, badgeTier:"top", initials:"JP", name:"Jan Peeters", proType:"flexi" },
  { id:"p2", cats:["cleaning"], rating:4.9, reviews:611, badgeTier:"elite", initials:"SM", name:"Sofie Maes", proType:"business" },
  { id:"p3", cats:["renovation"], rating:4.7, reviews:208, badgeTier:null, initials:"KW", name:"Kevin Willems", proType:"business" },
  { id:"p4", cats:["moving"], rating:4.9, reviews:455, badgeTier:"top", initials:"AD", name:"Anke De Wilde", proType:"business" },
  { id:"p5", cats:["renovation","repair"], rating:4.6, reviews:129, badgeTier:null, initials:"BV", name:"Bram Van Damme", proType:"flexi" },
  { id:"p6", cats:["tutoring"], rating:5.0, reviews:88, badgeTier:"elite", initials:"NV", name:"Nele Verbruggen", proType:"flexi" },
  { id:"p7", cats:["moving","cleaning"], rating:4.8, reviews:301, badgeTier:null, initials:"TC", name:"Tom Coppens", proType:"business" },
  { id:"p8", cats:["specialist"], rating:4.9, reviews:156, badgeTier:"elite", initials:"LP", name:"Laurens Peeters", proType:"business" },
  { id:"p9", cats:["specialist"], rating:4.8, reviews:302, badgeTier:"top", initials:"YB", name:"Yasmine Benali", proType:"business" },
  { id:"p10", cats:["specialist","repair"], rating:4.7, reviews:98, badgeTier:null, initials:"DP", name:"Dirk Praet", proType:"business" },
];

const PLATFORM_COMMISSION_RATE = 0.12;
const FLEXI_TAX_FREE_THRESHOLD = 18440;
const BOOST_WEEKLY_PRICE = 9;

const PRO_BIO_I18N = {
  nl:{p1:"12 jaar ervaring in klussen door heel Vlaanderen. Erkend elektricien, stipt en steeds net werk.",p2:"Gespecialiseerd in dieptereiniging. Ecologische producten op aanvraag.",p3:"Schilderwerk en kleine renovaties. Gratis kleuradvies inbegrepen.",p4:"Zorgvuldige verhuizers, eigen vrachtwagen, verzekerd tegen schade.",p5:"Tegelwerk en algemene klussen. Deze week nog beschikbaar.",p6:"Gediplomeerd leerkracht Engels, 8 jaar ervaring met online bijles.",p7:"Snelle, vriendelijke verhuisploeg, ook schoonmaak na de verhuis.",p8:"Erkend juridisch adviseur, gespecialiseerd in verblijfsrecht en administratieve procedures voor buitenlanders.",p9:"Beëdigd vertaler Frans-Nederlands-Engels, gespecialiseerd in officiële documenten.",p10:"Erkend EPC-deskundige en gecertificeerd voor asbestinventarisatie en -verwijdering."},
  fr:{p1:"12 ans d'expérience en travaux à travers toute la Flandre. Électricien agréé, ponctuel, travail toujours soigné.",p2:"Spécialiste du nettoyage en profondeur. Produits écologiques sur demande.",p3:"Peinture et petites rénovations. Conseil couleur gratuit inclus.",p4:"Déménageurs soigneux, camion propre, assurés contre la casse.",p5:"Carrelage et petits travaux. Disponible cette semaine.",p6:"Professeure d'anglais diplômée, 8 ans d'expérience en cours en ligne.",p7:"Équipe de déménagement rapide et sympathique, aussi nettoyage après déménagement.",p8:"Conseiller juridique agréé, spécialisé en droit de séjour et démarches administratives pour étrangers.",p9:"Traductrice assermentée français-néerlandais-anglais, spécialisée en documents officiels.",p10:"Expert PEB agréé et certifié pour l'inventaire et le désamiantage."},
  de:{p1:"12 Jahre Erfahrung mit Reparaturen in ganz Flandern. Geprüfter Elektriker, pünktlich, stets saubere Arbeit.",p2:"Spezialistin für Tiefenreinigung. Ökologische Produkte auf Anfrage.",p3:"Malerarbeiten und kleine Renovierungen. Kostenlose Farbberatung inklusive.",p4:"Sorgfältige Umzugshelfer, eigener LKW, gegen Schäden versichert.",p5:"Fliesenarbeiten und allgemeine Reparaturen. Diese Woche noch verfügbar.",p6:"Diplomierte Englischlehrerin, 8 Jahre Erfahrung mit Online-Nachhilfe.",p7:"Schnelles, freundliches Umzugsteam, auch Reinigung nach dem Umzug.",p8:"Zugelassener Rechtsberater, spezialisiert auf Aufenthaltsrecht und Behördengänge für Ausländer.",p9:"Beeidigte Übersetzerin Französisch-Niederländisch-Englisch, spezialisiert auf amtliche Dokumente.",p10:"Zugelassener EPC-Sachverständiger, zertifiziert für Asbestinventar und -sanierung."},
  en:{p1:"12 years fixing homes across Flanders. Licensed electrician, punctual, and clean work every time.",p2:"Deep-cleaning specialist. Eco-friendly products available on request.",p3:"Painting and small renovation jobs. Free colour consultation included.",p4:"Careful movers, own truck, insured against breakage.",p5:"Tiling and general handyman repairs. Available this week.",p6:"Certified English teacher, 8 years of online tutoring experience.",p7:"Fast, friendly moving crew, also offers post-move cleaning.",p8:"Licensed legal advisor specialising in residence law and administrative procedures for foreigners.",p9:"Certified French-Dutch-English translator, specialising in official documents.",p10:"Licensed EPC assessor, certified for asbestos inventory and removal."},
  ar:{p1:"12 عامًا من الخبرة في إصلاح المنازل في جميع أنحاء فلاندرز. كهربائي مرخّص، دقيق المواعيد، وعمل نظيف دائمًا.",p2:"متخصصة في التنظيف العميق. منتجات صديقة للبيئة عند الطلب.",p3:"أعمال دهان وتجديدات صغيرة. استشارة ألوان مجانية ضمن الخدمة.",p4:"عمال نقل حريصون، شاحنة خاصة، مؤمَّن ضد الأضرار.",p5:"أعمال بلاط وإصلاحات عامة. متاح هذا الأسبوع.",p6:"معلمة لغة إنجليزية معتمدة، 8 سنوات خبرة في التدريس عبر الإنترنت.",p7:"فريق نقل سريع وودود، ويقدم أيضًا تنظيفًا بعد الانتقال.",p8:"مستشار قانوني مرخّص، متخصص في قانون الإقامة والإجراءات الإدارية للأجانب.",p9:"مترجمة معتمدة فرنسي-هولندي-إنجليزي، متخصصة في المستندات الرسمية.",p10:"خبير معتمد لشهادات الأداء الطاقي (EPC)، ومعتمد لجرد وإزالة الأسبستوس."},
  tr:{p1:"Flandre genelinde 12 yıllık tamirat deneyimi. Lisanslı elektrikçi, dakik ve her zaman temiz iş.",p2:"Derinlemesine temizlik uzmanı. Talep üzerine çevre dostu ürünler.",p3:"Boya ve küçük tadilat işleri. Ücretsiz renk danışmanlığı dahil.",p4:"Titiz nakliyeciler, kendi kamyonu, hasara karşı sigortalı.",p5:"Fayans döşeme ve genel tamirat işleri. Bu hafta müsait.",p6:"Sertifikalı İngilizce öğretmeni, 8 yıllık online özel ders deneyimi.",p7:"Hızlı, samimi nakliye ekibi, taşıma sonrası temizlik de sunuyor.",p8:"Yabancılar için oturma hakkı ve idari işlemler konusunda uzman, lisanslı hukuk danışmanı.",p9:"Fransızca-Felemenkçe-İngilizce yeminli tercüman, resmi belgeler konusunda uzman.",p10:"Lisanslı EPC uzmanı, asbest tespiti ve sökümü konusunda sertifikalı."},
  ru:{p1:"12 лет опыта ремонта домов по всей Фландрии. Лицензированный электрик, пунктуален, всегда аккуратная работа.",p2:"Специалист по глубокой уборке. Экологичные средства по запросу.",p3:"Покраска и небольшой ремонт. Бесплатная консультация по цвету включена.",p4:"Аккуратные грузчики, собственный грузовик, застрахованы от повреждений.",p5:"Укладка плитки и общий ремонт. Свободен на этой неделе.",p6:"Дипломированный преподаватель английского, 8 лет опыта онлайн-репетиторства.",p7:"Быстрая, дружелюбная бригада переезда, также предлагает уборку после переезда.",p8:"Лицензированный юридический консультант, специализирующийся на праве проживания и административных процедурах для иностранцев.",p9:"Сертифицированный переводчик французский-нидерландский-английский, специализируется на официальных документах.",p10:"Лицензированный эксперт по EPC, сертифицирован для инвентаризации и удаления асбеста."},
  zh:{p1:"12年家居维修经验，服务遍及弗兰德斯地区。持证电工，准时守信，工作干净利落。",p2:"深度清洁专家，可应要求提供环保清洁产品。",p3:"油漆粉刷及小型装修工程，免费提供配色建议。",p4:"细心的搬运团队，自备货车，并有损坏保险。",p5:"贴砖及各类维修工作，本周有空。",p6:"持证英语教师，拥有8年在线家教经验。",p7:"高效友善的搬家团队，同时提供搬家后清洁服务。",p8:"持证法律顾问，专注于外籍人士居留法律与行政手续。",p9:"持证法语-荷兰语-英语翻译，专长官方文件翻译。",p10:"持证EPC评估师，具备石棉检测与清除资质。"},
};

const CURRENT_PRO_ID = "p1";

let idCounter = 1;
const nextId = (p) => `${p}${idCounter++}`;

/* --------------------------------- CONTEXT --------------------------------- */

const LangContext = createContext(null);
function useLang() { return useContext(LangContext); }

/* --------------------------------- HELPERS --------------------------------- */

function Stars({ value, size = 13 }) {
  return (
    <span className="stars">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} fill={i <= Math.round(value) ? "var(--amber)" : "none"} color={i <= Math.round(value) ? "var(--amber)" : "var(--line-strong)"} strokeWidth={1.5} />
      ))}
    </span>
  );
}

function TicketTear() { return <div className="tear" />; }
function Badge({ children, tone = "sage" }) { return <span className={`badge badge-${tone}`}>{children}</span>; }

/* ---------------------------------- APP ---------------------------------- */

export default function App() {
  const [langCode, setLangCode] = useState("nl");
  const [role, setRole] = useState("customer");
  const [requests, setRequests] = useState([]);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const langMeta = LANGS.find((l) => l.code === langCode);
  const t = STRINGS[langCode];
  const dir = langCode === "ar" ? "rtl" : "ltr";
  const fmt = (n) => Number(n).toLocaleString(langMeta.locale);
  const fmtDate = (ts) => new Date(ts).toLocaleDateString(langMeta.locale);
  const catName = (id) => CAT_I18N[langCode][id];
  const serviceInfo = (id) => SERVICE_I18N[langCode][id];
  const proBio = (id) => PRO_BIO_I18N[langCode][id];
  const proBadgeLabel = (tier) => (tier === "top" ? t.topRated : tier === "elite" ? t.elitePro : null);

  const ctx = { t, dir, fmt, fmtDate, catName, serviceInfo, proBio, proBadgeLabel, langCode };

  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };

  const createRequest = (service, answers) => {
    const id = nextId("r");
    const req = { id, cat: service.cat, serviceId: service.id, mode: service.mode, answers, base: service.base, createdAt: Date.now(), status: "collecting", quotes: [], bookedProId: null, review: null };
    setRequests((r) => [req, ...r]);

    const candidates = BASE_PROS.filter((p) => p.cats.includes(service.cat));
    const n = Math.min(candidates.length, 2 + Math.floor(Math.random() * 2));
    const chosen = [...candidates].sort(() => 0.5 - Math.random()).slice(0, n);
    chosen.forEach((pro, i) => {
      setTimeout(() => {
        setRequests((rs) => rs.map((r) => {
          if (r.id !== id || r.quotes.some((q) => q.proId === pro.id)) return r;
          const price = Math.round((service.base * (0.85 + Math.random() * 0.5)) / 5) * 5;
          return { ...r, status: "quotes_ready", quotes: [...r.quotes, { proId: pro.id, price, sentAt: Date.now() }] };
        }));
      }, 1400 + i * 1600);
    });
  };

  const acceptQuote = (requestId, proId) => {
    setRequests((rs) => rs.map((r) => (r.id === requestId ? { ...r, status: "booked", bookedProId: proId } : r)));
    showToast(t.toastBooked);
  };
  const markComplete = (requestId) => setRequests((rs) => rs.map((r) => (r.id === requestId ? { ...r, status: "completed" } : r)));
  const submitReview = (requestId, review) => {
    setRequests((rs) => rs.map((r) => (r.id === requestId ? { ...r, status: "reviewed", review } : r)));
    showToast(t.toastThanks);
  };
  const proSendQuote = (requestId, price, message) => {
    setRequests((rs) => rs.map((r) => {
      if (r.id !== requestId || r.quotes.some((q) => q.proId === CURRENT_PRO_ID)) return r;
      return { ...r, status: "quotes_ready", quotes: [...r.quotes, { proId: CURRENT_PRO_ID, price, message, sentAt: Date.now() }] };
    }));
    showToast(t.toastQuoteSent);
  };

  return (
    <LangContext.Provider value={ctx}>
      <div className="stage" dir={dir}>
        <style>{CSS}</style>

        <div className="topbar">
          <div className="role-switch">
            <span className="role-switch-label">{t.previewingAs}</span>
            <div className="segmented">
              <button className={role === "customer" ? "seg-on" : ""} onClick={() => setRole("customer")}>{t.roleCustomer}</button>
              <button className={role === "pro" ? "seg-on" : ""} onClick={() => setRole("pro")}>{t.rolePro}</button>
            </div>
          </div>
          <div className="lang-switch">
            <Globe size={13} color="#c9d6cd" />
            <select value={langCode} onChange={(e) => setLangCode(e.target.value)}>
              {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>
        </div>

        <div className={`phone lang-${langCode}`}>
          <div className="notch" />
          <div className="statusbar"><span>9:41</span><span className="statusbar-dots">\u2022 \u2022 \u2022</span></div>
          <div className="screen">
            {role === "customer" ? (
              <CustomerApp requests={requests} createRequest={createRequest} acceptQuote={acceptQuote} markComplete={markComplete} submitReview={submitReview} />
            ) : (
              <ProApp requests={requests} proSendQuote={proSendQuote} />
            )}
          </div>
          {toast && <div className="toast">{toast}</div>}
        </div>
      </div>
    </LangContext.Provider>
  );
}

/* ------------------------------- CUSTOMER APP ------------------------------ */

function CustomerApp({ requests, createRequest, acceptQuote, markComplete, submitReview }) {
  const { t } = useLang();
  const [tab, setTab] = useState("discover");
  const [activeService, setActiveService] = useState(null);
  const [quoteForm, setQuoteForm] = useState(null);
  const [openRequest, setOpenRequest] = useState(null);
  const [reviewFor, setReviewFor] = useState(null);

  const openRequestObj = requests.find((r) => r.id === openRequest);
  const reviewReq = requests.find((r) => r.id === reviewFor);

  return (
    <div className="view">
      <div className="content">
        {tab === "discover" && <Discover onOpenService={(s) => setActiveService(s)} />}
        {tab === "requests" && <RequestsList requests={requests} onOpen={(id) => setOpenRequest(id)} />}
        {tab === "messages" && <MessagesStub />}
        {tab === "profile" && <CustomerProfile requests={requests} />}
      </div>

      <BottomNav tab={tab} setTab={setTab} items={[
        { id: "discover", label: t.navDiscover, icon: Home },
        { id: "requests", label: t.navRequests, icon: ClipboardList, badge: requests.filter((r) => r.status === "quotes_ready").length },
        { id: "messages", label: t.navMessages, icon: MessageCircle },
        { id: "profile", label: t.navProfile, icon: User },
      ]} />

      {activeService && <ServiceSheet service={activeService} onClose={() => setActiveService(null)} onRequest={() => { setQuoteForm(activeService); setActiveService(null); }} />}
      {quoteForm && <QuoteFormSheet service={quoteForm} onClose={() => setQuoteForm(null)} onSubmit={(answers) => { createRequest(quoteForm, answers); setQuoteForm(null); setTab("requests"); }} />}
      {openRequestObj && <RequestDetailSheet request={openRequestObj} onClose={() => setOpenRequest(null)} onAccept={(proId) => acceptQuote(openRequestObj.id, proId)} onComplete={() => markComplete(openRequestObj.id)} onReview={() => { setOpenRequest(null); setReviewFor(openRequestObj.id); }} />}
      {reviewReq && <ReviewSheet request={reviewReq} onClose={() => setReviewFor(null)} onSubmit={(review) => { submitReview(reviewReq.id, review); setReviewFor(null); }} />}
    </div>
  );
}

function Discover({ onOpenService }) {
  const { t, fmt, catName, serviceInfo } = useLang();
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const list = BASE_SERVICES.filter((s) => (cat === "all" || s.cat === cat) && serviceInfo(s.id).name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="pad">
      <div className="hello">
        <div><div className="eyebrow">{t.greeting}</div><div className="h1">{t.heroTitle}</div></div>
        <div className="pin"><MapPin size={13} /> {t.location}</div>
      </div>

      <div className="search"><Search size={16} color="var(--ink-soft)" /><input placeholder={t.searchPlaceholder} value={q} onChange={(e) => setQ(e.target.value)} /></div>

      <div className="chiprow">
        <button className={"chip" + (cat === "all" ? " chip-on" : "")} onClick={() => setCat("all")}>{t.catAll}</button>
        {CATS.map((c) => (
          <button key={c.id} className={"chip" + (cat === c.id ? " chip-on" : "")} onClick={() => setCat(c.id)}><c.icon size={13} /> {catName(c.id)}</button>
        ))}
      </div>

      <div className="section-title">{t.trendingTitle}</div>
      <div className="grid2">
        {list.map((s) => {
          const info = serviceInfo(s.id);
          return (
            <button key={s.id} className="svc-card" onClick={() => onOpenService(s)}>
              <div className="svc-icon">{React.createElement(CATS.find((c) => c.id === s.cat).icon, { size: 18, color: "var(--forest)" })}</div>
              <div className="svc-name">{info.name}</div>
              {s.certifiedOnly && <div className="svc-certified"><BadgeCheck size={11} /> {t.certifiedOnlyBadge}</div>}
              <div className="svc-meta">{fmt(s.pros)} {t.prosSuffix}</div>
              <div className="svc-rating"><Stars value={s.rating} size={11} /> <span>{s.rating}</span></div>
              <div className={"svc-cta " + (s.mode === "book" ? "cta-book" : "cta-quote")}>{s.mode === "book" ? t.serviceBookNow : t.roleCustomer === t.roleCustomer ? t.serviceGetQuotes : ""}</div>
            </button>
          );
        })}
        {list.length === 0 && <div className="empty">{t.noServicesFound}</div>}
      </div>
    </div>
  );
}

function ServiceSheet({ service, onClose, onRequest }) {
  const { t, fmt, serviceInfo } = useLang();
  const info = serviceInfo(service.id);
  const Icon = CATS.find((c) => c.id === service.cat).icon;
  return (
    <Sheet onClose={onClose}>
      <div className="sheet-icon-lg"><Icon size={22} color="var(--forest)" /></div>
      <div className="sheet-title">{info.name}</div>
      {service.certifiedOnly && <Badge tone="forest">{t.certifiedOnlyBadge}</Badge>}
      <div className="sheet-sub">{fmt(service.pros)} {t.prosSuffix} \u00b7 <Stars value={service.rating} size={12} /> {service.rating} ({fmt(service.reviews)})</div>
      <p className="sheet-blurb">{info.blurb}</p>
      <div className="price-hint">{t.typicalPrice} <b>\u20ac{fmt(Math.round(service.base * 0.8))} \u2013 \u20ac{fmt(Math.round(service.base * 1.3))}</b></div>
      <button className="btn-primary" onClick={onRequest}>{service.mode === "book" ? t.serviceBookNow : t.serviceGetQuotes} <ChevronRight size={16} /></button>
    </Sheet>
  );
}

function QuoteFormSheet({ service, onClose, onSubmit }) {
  const { t, serviceInfo } = useLang();
  const info = serviceInfo(service.id);
  const [details, setDetails] = useState("");
  const [when, setWhen] = useState(t.whenThisWeek);
  const [budget, setBudget] = useState("");

  return (
    <Sheet onClose={onClose}>
      <div className="sheet-title">{t.quoteFormTitle}</div>
      <div className="sheet-sub">{t.forService} {info.name}</div>

      <label className="field-label">{t.whenLabel}</label>
      <div className="chiprow">
        {[t.whenThisWeek, t.whenNextWeek, t.whenFlexible].map((w) => (
          <button key={w} className={"chip" + (when === w ? " chip-on" : "")} onClick={() => setWhen(w)}>{w}</button>
        ))}
      </div>

      <label className="field-label">{t.detailsLabel}</label>
      <textarea className="textarea" rows={3} placeholder={t.detailsPlaceholder} value={details} onChange={(e) => setDetails(e.target.value)} />

      <label className="field-label">{t.budgetLabel}</label>
      <div className="search" style={{ marginBottom: 18 }}>
        <span style={{ color: "var(--ink-soft)", fontFamily: "var(--font-mono)" }}>\u20ac</span>
        <input placeholder={t.budgetPlaceholder} value={budget} onChange={(e) => setBudget(e.target.value)} />
      </div>

      <button className="btn-primary" onClick={() => onSubmit({ when, details: details || "\u2014", budget })}><Send size={15} /> {t.sendRequestBtn}</button>
      <div className="fineprint"><ShieldCheck size={12} /> {t.privacyNote}</div>
    </Sheet>
  );
}

function RequestsList({ requests, onOpen }) {
  const { t, fmtDate, serviceInfo } = useLang();
  return (
    <div className="pad">
      <div className="h1" style={{ marginBottom: 14 }}>{t.myRequestsTitle}</div>
      {requests.length === 0 && (
        <div className="empty-block"><ClipboardList size={26} color="var(--ink-soft)" /><p>{t.noRequestsYet}</p></div>
      )}
      {requests.map((r) => (
        <button key={r.id} className="ticket" onClick={() => onOpen(r.id)}>
          <TicketTear />
          <div className="ticket-body">
            <div className="ticket-row"><div className="ticket-title">{serviceInfo(r.serviceId).name}</div><StatusPill status={r.status} /></div>
            <div className="ticket-sub">{r.answers.when} \u00b7 {fmtDate(r.createdAt)}</div>
            <div className="ticket-divider" />
            <div className="ticket-foot">
              {r.status === "collecting" && <span className="waiting"><Clock size={12} /> {t.waitingForQuotes}</span>}
              {r.status !== "collecting" && <span>{r.quotes.length} {t.quotesReceived}</span>}
              <ChevronRight size={16} color="var(--ink-soft)" />
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function StatusPill({ status }) {
  const { t } = useLang();
  const map = { collecting: [t.statusCollecting, "amber"], quotes_ready: [t.statusQuotesReady, "forest"], booked: [t.statusBooked, "forest"], completed: [t.statusCompleted, "sage"], reviewed: [t.statusReviewed, "sage"] };
  const [label, tone] = map[status];
  return <Badge tone={tone}>{label}</Badge>;
}

function RequestDetailSheet({ request, onClose, onAccept, onComplete, onReview }) {
  const { t, fmt, serviceInfo, proBadgeLabel } = useLang();
  const [showInvoice, setShowInvoice] = useState(false);
  const info = serviceInfo(request.serviceId);
  const bookedQuote = request.quotes.find((q) => q.proId === request.bookedProId);
  const proOf = (proId) => BASE_PROS.find((p) => p.id === proId);

  return (
    <Sheet onClose={onClose}>
      <div className="sheet-title">{info.name}</div>
      <div className="sheet-sub">{request.answers.when} \u00b7 "{request.answers.details}"</div>

      {request.status === "collecting" && (
        <div className="empty-block"><Clock size={22} color="var(--ink-soft)" /><p>{t.waitingMsg}</p></div>
      )}

      {request.status === "quotes_ready" && (
        <>
          <div className="section-title" style={{ marginTop: 6 }}>{t.quotesTitle} ({request.quotes.length})</div>
          {request.quotes.map((q) => {
            const pro = proOf(q.proId);
            return (
              <div key={q.proId} className="quote-card">
                <div className="quote-top">
                  <div className="avatar">{pro.initials}</div>
                  <div style={{ flex: 1 }}>
                    <div className="quote-name">{pro.name} {proBadgeLabel(pro.badgeTier) && <Badge tone="forest">{proBadgeLabel(pro.badgeTier)}</Badge>}</div>
                    <div className="quote-rating"><Stars value={pro.rating} size={11} /> {pro.rating} ({fmt(pro.reviews)})</div>
                  </div>
                  <div className="quote-price">\u20ac{fmt(q.price)}</div>
                </div>
                <button className="btn-secondary" onClick={() => onAccept(q.proId)}>{t.acceptQuoteBtn}</button>
              </div>
            );
          })}
        </>
      )}

      {request.status === "booked" && bookedQuote && (() => {
        const pro = proOf(bookedQuote.proId);
        const fee = Math.round(bookedQuote.price * PLATFORM_COMMISSION_RATE * 100) / 100;
        const net = Math.round((bookedQuote.price - fee) * 100) / 100;
        return (
          <div className="quote-card quote-card-booked">
            <div className="quote-top">
              <div className="avatar">{pro.initials}</div>
              <div style={{ flex: 1 }}><div className="quote-name">{pro.name}</div><div className="quote-rating"><Stars value={pro.rating} size={11} /> {pro.rating}</div></div>
              <div className="quote-price">\u20ac{fmt(bookedQuote.price)}</div>
            </div>
            <div className="ticket-divider" />
            <div className="fee-row"><span>{t.platformFeeLabel}</span><span>\u20ac{fmt(fee)}</span></div>
            <div className="fee-row fee-row-net"><span>{t.netPayoutLabel}</span><span>\u20ac{fmt(net)}</span></div>
            <div className="fineprint" style={{ marginTop: 10 }}><ShieldCheck size={12} /> {t.guaranteeNote}</div>
            <button className="btn-primary" style={{ marginTop: 12 }} onClick={onComplete}>{t.markCompleteBtn}</button>
            <button className="btn-secondary" style={{ marginTop: 8 }} onClick={() => setShowInvoice(true)}>{t.viewInvoiceBtn}</button>
          </div>
        );
      })()}

      {request.status === "completed" && (
        <div className="empty-block"><Check size={22} color="var(--forest)" /><p>{t.completeMsg}</p><button className="btn-primary" onClick={onReview}>{t.leaveReviewBtn}</button><button className="btn-secondary" style={{ marginTop: 8 }} onClick={() => setShowInvoice(true)}>{t.viewInvoiceBtn}</button></div>
      )}

      {request.status === "reviewed" && (
        <div className="quote-card"><div className="quote-top"><Stars value={request.review.stars} size={16} /></div><p className="quote-msg">"{request.review.text}"</p><button className="btn-secondary" onClick={() => setShowInvoice(true)}>{t.viewInvoiceBtn}</button></div>
      )}

      {showInvoice && bookedQuote && <InvoiceSheet request={request} quote={bookedQuote} onClose={() => setShowInvoice(false)} />}
    </Sheet>
  );
}

function InvoiceSheet({ request, quote, onClose }) {
  const { t, fmt, serviceInfo } = useLang();
  const info = serviceInfo(request.serviceId);
  const pro = BASE_PROS.find((p) => p.id === quote.proId);
  const vat = Math.round(quote.price * 0.21 * 100) / 100;
  const total = Math.round((quote.price + vat) * 100) / 100;
  return (
    <Sheet onClose={onClose}>
      <div className="sheet-title">{t.invoiceTitle}</div>
      <div className="invoice-box">
        <div className="invoice-row"><span>{t.invoiceRef}</span><span>KLS-{request.id.toUpperCase()}</span></div>
        <div className="invoice-row"><span>{t.invoiceSupplier}</span><span>{pro.name}</span></div>
        <div className="invoice-row"><span>{t.invoiceCustomer}</span><span>{t.profileYou}</span></div>
        <div className="invoice-row"><span>{t.invoiceService}</span><span>{info.name}</span></div>
        <div className="ticket-divider" />
        <div className="invoice-row"><span>{t.invoiceAmount}</span><span>\u20ac{fmt(quote.price)}</span></div>
        <div className="invoice-row"><span>{t.invoiceVat}</span><span>\u20ac{fmt(vat)}</span></div>
        <div className="invoice-row invoice-total"><span>{t.invoiceTotal}</span><span>\u20ac{fmt(total)}</span></div>
      </div>
      <div className="fineprint" style={{ marginTop: 12 }}>{t.invoiceNote}</div>
    </Sheet>
  );
}

function ReviewSheet({ request, onClose, onSubmit }) {
  const { t } = useLang();
  const [stars, setStars] = useState(5);
  const [text, setText] = useState("");
  return (
    <Sheet onClose={onClose}>
      <div className="sheet-title">{t.reviewTitle}</div>
      <div className="star-picker">
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} onClick={() => setStars(i)}><Star size={30} fill={i <= stars ? "var(--amber)" : "none"} color={i <= stars ? "var(--amber)" : "var(--line-strong)"} strokeWidth={1.5} /></button>
        ))}
      </div>
      <textarea className="textarea" rows={3} placeholder={t.howDidItGo} value={text} onChange={(e) => setText(e.target.value)} />
      <button className="btn-primary" onClick={() => onSubmit({ stars, text: text || t.defaultReviewText })}>{t.submitReviewBtn}</button>
    </Sheet>
  );
}

function CustomerProfile({ requests }) {
  const { t, serviceInfo } = useLang();
  const completed = requests.filter((r) => r.status === "completed" || r.status === "reviewed").length;
  const reviews = requests.filter((r) => r.review);
  return (
    <div className="pad">
      <div className="profile-head"><div className="avatar avatar-lg">{t.profileYou[0]}</div><div><div className="h1" style={{ fontSize: 19 }}>{t.profileYou}</div><div className="ticket-sub">{t.memberSince}</div></div></div>
      <div className="stat-row">
        <div className="stat"><div className="stat-num">{requests.length}</div><div className="stat-label">{t.requestsSent}</div></div>
        <div className="stat"><div className="stat-num">{completed}</div><div className="stat-label">{t.jobsCompleted}</div></div>
      </div>
      <div className="section-title">{t.yourReviews}</div>
      {reviews.length === 0 && <div className="empty-block"><p>{t.noReviewsYet}</p></div>}
      {reviews.map((r) => (
        <div key={r.id} className="quote-card"><div className="quote-name">{serviceInfo(r.serviceId).name}</div><Stars value={r.review.stars} size={12} /><p className="quote-msg">"{r.review.text}"</p></div>
      ))}
    </div>
  );
}

function MessagesStub() {
  const { t } = useLang();
  return (
    <div className="pad">
      <div className="h1" style={{ marginBottom: 14 }}>{t.messagesTitle}</div>
      <div className="empty-block"><MessageCircle size={26} color="var(--ink-soft)" /><p>{t.messagesEmpty}</p></div>
    </div>
  );
}

/* ---------------------------------- PRO APP -------------------------------- */

function ProApp({ requests, proSendQuote }) {
  const { t } = useLang();
  const [tab, setTab] = useState("dashboard");
  const [quoteLead, setQuoteLead] = useState(null);

  const currentPro = BASE_PROS.find((p) => p.id === CURRENT_PRO_ID);
  const [proType, setProType] = useState(currentPro.proType);
  const isCertifiedOnly = (serviceId) => !!BASE_SERVICES.find((s) => s.id === serviceId)?.certifiedOnly;
  const hiddenCertifiedCount = requests.filter((r) => currentPro.cats.includes(r.cat) && isCertifiedOnly(r.serviceId) && !r.quotes.some((q) => q.proId === CURRENT_PRO_ID) && r.status !== "booked" && proType === "flexi").length;

  const leads = requests.filter((r) => {
    if (!currentPro.cats.includes(r.cat)) return false;
    if (r.quotes.some((q) => q.proId === CURRENT_PRO_ID)) return false;
    if (r.status === "booked") return false;
    if (proType === "flexi" && isCertifiedOnly(r.serviceId)) return false;
    return true;
  });
  const sent = requests.filter((r) => r.quotes.some((q) => q.proId === CURRENT_PRO_ID) && r.bookedProId !== CURRENT_PRO_ID);
  const booked = requests.filter((r) => r.bookedProId === CURRENT_PRO_ID && r.status === "booked");
  const completed = requests.filter((r) => r.bookedProId === CURRENT_PRO_ID && (r.status === "completed" || r.status === "reviewed"));
  const earnedGross = [...booked, ...completed].reduce((sum, r) => {
    const q = r.quotes.find((qq) => qq.proId === CURRENT_PRO_ID);
    return sum + (q ? q.price * (1 - PLATFORM_COMMISSION_RATE) : 0);
  }, 0);

  return (
    <div className="view">
      <div className="content">
        {tab === "dashboard" && <ProDashboard leads={leads} onQuote={(l) => setQuoteLead(l)} proType={proType} hiddenCertifiedCount={hiddenCertifiedCount} />}
        {tab === "jobs" && <ProJobs sent={sent} booked={booked} completed={completed} />}
        {tab === "profile" && <ProProfile completedCount={completed.length} earnedGross={earnedGross} proType={proType} setProType={setProType} />}
      </div>

      <BottomNav tab={tab} setTab={setTab} items={[
        { id: "dashboard", label: t.navDashboard, icon: Briefcase, badge: leads.length },
        { id: "jobs", label: t.navMyJobs, icon: ClipboardList },
        { id: "profile", label: t.navProfile, icon: User },
      ]} />

      {quoteLead && <SendQuoteSheet lead={quoteLead} onClose={() => setQuoteLead(null)} onSubmit={(price, msg) => { proSendQuote(quoteLead.id, price, msg); setQuoteLead(null); }} />}
    </div>
  );
}

function ProDashboard({ leads, onQuote, proType, hiddenCertifiedCount }) {
  const { t, fmt, serviceInfo } = useLang();
  const currentPro = BASE_PROS.find((p) => p.id === CURRENT_PRO_ID);
  return (
    <div className="pad">
      <div className="hello"><div><div className="eyebrow">{t.proWelcome}</div><div className="h1">{currentPro.name}</div></div><div className="avatar">{currentPro.initials}</div></div>

      <div className="stat-row">
        <div className="stat"><div className="stat-num"><Stars value={currentPro.rating} size={12} /></div><div className="stat-label">{currentPro.rating} {t.statScore}</div></div>
        <div className="stat"><div className="stat-num">{fmt(currentPro.reviews)}</div><div className="stat-label">{t.statReviewsLabel}</div></div>
        <div className="stat"><div className="stat-num">92%</div><div className="stat-label">{t.statResponseRate}</div></div>
      </div>

      <div className="section-title">{t.newLeadsTitle}</div>
      {leads.length === 0 && <div className="empty-block"><TrendingUp size={22} color="var(--ink-soft)" /><p>{t.noLeadsMsg}</p></div>}
      {leads.map((r) => (
        <div key={r.id} className="ticket">
          <TicketTear />
          <div className="ticket-body">
            <div className="ticket-row"><div className="ticket-title">{serviceInfo(r.serviceId).name}</div><Badge tone="amber">{t.newBadge}</Badge></div>
            <div className="ticket-sub">{r.answers.when} \u00b7 {r.answers.budget ? `\u20ac${r.answers.budget}` : t.budgetFlexible}</div>
            <p className="quote-msg" style={{ margin: "8px 0" }}>"{r.answers.details}"</p>
            <div className="ticket-divider" />
            <button className="btn-secondary" onClick={() => onQuote(r)}>{t.sendQuoteBtn}</button>
          </div>
        </div>
      ))}
      {proType === "flexi" && hiddenCertifiedCount > 0 && (
        <div className="fineprint" style={{ marginTop: 4 }}><BadgeCheck size={12} /> {t.flexiHiddenNote}</div>
      )}
    </div>
  );
}

function SendQuoteSheet({ lead, onClose, onSubmit }) {
  const { t, serviceInfo } = useLang();
  const [price, setPrice] = useState(lead.base || 65);
  const [msg, setMsg] = useState(t.defaultProMessage);
  return (
    <Sheet onClose={onClose}>
      <div className="sheet-title">{t.sendQuoteTitle}</div>
      <div className="sheet-sub">{serviceInfo(lead.serviceId).name}</div>

      <label className="field-label">{t.yourPriceLabel}</label>
      <div className="search" style={{ marginBottom: 18 }}>
        <span style={{ color: "var(--ink-soft)", fontFamily: "var(--font-mono)" }}>\u20ac</span>
        <input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))} />
      </div>

      <label className="field-label">{t.messageToCustomerLabel}</label>
      <textarea className="textarea" rows={3} value={msg} onChange={(e) => setMsg(e.target.value)} />

      <button className="btn-primary" onClick={() => onSubmit(price, msg)}><Send size={15} /> {t.sendQuoteSubmit}</button>
    </Sheet>
  );
}

function ProJobs({ sent, booked, completed }) {
  const { t, fmt, serviceInfo } = useLang();
  const [seg, setSeg] = useState("sent");
  const list = seg === "sent" ? sent : seg === "booked" ? booked : completed;
  return (
    <div className="pad">
      <div className="h1" style={{ marginBottom: 14 }}>{t.myJobsTitle}</div>
      <div className="segmented" style={{ marginBottom: 16 }}>
        <button className={seg === "sent" ? "seg-on" : ""} onClick={() => setSeg("sent")}>{t.segSent} ({sent.length})</button>
        <button className={seg === "booked" ? "seg-on" : ""} onClick={() => setSeg("booked")}>{t.segBooked} ({booked.length})</button>
        <button className={seg === "completed" ? "seg-on" : ""} onClick={() => setSeg("completed")}>{t.segDone} ({completed.length})</button>
      </div>

      {list.length === 0 && <div className="empty-block"><p>{t.nothingHereYet}</p></div>}

      {list.map((r) => {
        const myQuote = r.quotes.find((q) => q.proId === CURRENT_PRO_ID);
        return (
          <div key={r.id} className="ticket">
            <TicketTear />
            <div className="ticket-body">
              <div className="ticket-row">
                <div className="ticket-title">{serviceInfo(r.serviceId).name}</div>
                {seg === "sent" && <Badge tone="amber">{t.badgeWaiting}</Badge>}
                {seg === "booked" && <Badge tone="forest">{t.badgeBooked}</Badge>}
                {seg === "completed" && <Badge tone="sage">{t.badgeDone}</Badge>}
              </div>
              <div className="ticket-sub">{t.yourQuoteLabel} \u20ac{fmt(myQuote?.price ?? 0)}</div>
              {seg === "completed" && r.review && (<><div className="ticket-divider" /><Stars value={r.review.stars} size={12} /><p className="quote-msg">"{r.review.text}"</p></>)}
              {seg === "completed" && !r.review && <div className="ticket-sub" style={{ marginTop: 6 }}>{t.noReviewYet}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProProfile({ completedCount, earnedGross, proType, setProType }) {
  const { t, fmt, catName, proBio, proBadgeLabel } = useLang();
  const currentPro = BASE_PROS.find((p) => p.id === CURRENT_PRO_ID);
  const [cats, setCats] = useState(currentPro.cats);
  const [boosted, setBoosted] = useState(false);
  const toggle = (id) => setCats((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const flexiPct = Math.min(100, Math.round((earnedGross / FLEXI_TAX_FREE_THRESHOLD) * 100));

  return (
    <div className="pad">
      <div className="profile-head"><div className="avatar avatar-lg">{currentPro.initials}</div><div><div className="h1" style={{ fontSize: 19 }}>{currentPro.name}</div><div className="quote-rating"><Stars value={currentPro.rating} size={12} /> {currentPro.rating} ({fmt(currentPro.reviews)})</div></div></div>
      <p className="sheet-blurb">{proBio(CURRENT_PRO_ID)}</p>
      <div className="stat-row">
        <div className="stat"><div className="stat-num">{completedCount}</div><div className="stat-label">{t.proJobsDone}</div></div>
        <div className="stat"><div className="stat-num">{proBadgeLabel(currentPro.badgeTier) || "\u2014"}</div><div className="stat-label">{t.proStatus}</div></div>
      </div>

      <div className="section-title">{t.proTypeLabel}</div>
      <div className="segmented segmented-block">
        <button className={proType === "flexi" ? "seg-on" : ""} onClick={() => setProType("flexi")}>{t.proTypeFlexi}</button>
        <button className={proType === "business" ? "seg-on" : ""} onClick={() => setProType("business")}>{t.proTypeBusiness}</button>
      </div>

      {proType === "flexi" && (
        <div className="flexi-box">
          <div className="ticket-title" style={{ fontSize: 13.5, marginBottom: 8 }}>{t.flexiTrackerTitle}</div>
          <div className="flexi-bar"><div className="flexi-bar-fill" style={{ width: `${flexiPct}%` }} /></div>
          <div className="ticket-sub" style={{ marginTop: 6 }}>\u20ac{fmt(Math.round(earnedGross))} {t.flexiUsedOf} \u20ac{fmt(FLEXI_TAX_FREE_THRESHOLD)}</div>
          <div className="fineprint" style={{ marginTop: 8, justifyContent: "flex-start", textAlign: "start" }}>{t.flexiThresholdNote}</div>
        </div>
      )}

      <div className="section-title">{t.proServicesTitle}</div>
      <div className="chiprow">
        {CATS.map((c) => {
          const locked = c.id === "specialist" && proType === "flexi";
          return (
            <button key={c.id} className={"chip" + (cats.includes(c.id) && !locked ? " chip-on" : "") + (locked ? " chip-locked" : "")} disabled={locked} onClick={() => !locked && toggle(c.id)}>
              <c.icon size={13} /> {catName(c.id)}
            </button>
          );
        })}
      </div>

      <div className="section-title">{t.boostTitle}</div>
      <div className="quote-card">
        <p className="sheet-blurb" style={{ margin: "0 0 10px" }}>{t.boostDesc}</p>
        {boosted ? (
          <Badge tone="amber">{t.boostActive}</Badge>
        ) : (
          <button className="btn-primary" onClick={() => setBoosted(true)}>{t.boostBtn} \u20ac{BOOST_WEEKLY_PRICE}</button>
        )}
      </div>

      <div className="fineprint" style={{ marginTop: 14 }}><ThumbsUp size={12} /> {t.proFineprint}</div>
    </div>
  );
}

/* -------------------------------- SHARED UI -------------------------------- */

function BottomNav({ tab, setTab, items }) {
  return (
    <div className="tabbar">
      {items.map((it) => (
        <button key={it.id} className={"tab" + (tab === it.id ? " tab-on" : "")} onClick={() => setTab(it.id)}>
          <span className="tab-icon-wrap"><it.icon size={19} />{!!it.badge && <span className="tab-badge">{it.badge}</span>}</span>
          {it.label}
        </button>
      ))}
    </div>
  );
}

function Sheet({ children, onClose }) {
  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grabber" />
        <button className="sheet-close" onClick={onClose}><X size={16} /></button>
        <div className="sheet-scroll">{children}</div>
      </div>
    </div>
  );
}

/* ---------------------------------- STYLES --------------------------------- */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&family=Noto+Sans+Arabic:wght@400;600;700&family=Noto+Sans+SC:wght@400;500;700&display=swap');

:root{
  --forest:#1F4D3A; --forest-dark:#163828; --sage:#8FB996; --sage-bg:#E7F0E5;
  --paper:#EFEEE6; --surface:#FFFFFF; --amber:#E8A33D; --amber-bg:#FBEBD2;
  --ink:#16231C; --ink-soft:#5B6B60; --line:rgba(22,35,28,0.10); --line-strong:rgba(22,35,28,0.28);
  --font-display:'Fraunces',serif; --font-body:'Inter',sans-serif; --font-mono:'IBM Plex Mono',monospace;
}
*{box-sizing:border-box;}
.stage{ min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px; background:radial-gradient(circle at 30% 20%, #24382e 0%, #121b16 70%); padding:32px 16px; font-family:var(--font-body); }
.topbar{ display:flex; align-items:center; gap:16px; flex-wrap:wrap; justify-content:center; }
.role-switch{ display:flex; align-items:center; gap:10px; }
.role-switch-label{ color:#c9d6cd; font-size:12px; }
.segmented{ display:flex; background:rgba(255,255,255,0.08); border-radius:999px; padding:3px; }
.segmented button{ border:none; background:none; color:#c9d6cd; font-size:12.5px; font-weight:600; padding:6px 14px; border-radius:999px; cursor:pointer; font-family:var(--font-body); }
.segmented .seg-on{ background:var(--surface); color:var(--forest); }
.lang-switch{ display:flex; align-items:center; gap:6px; background:rgba(255,255,255,0.08); border-radius:999px; padding:5px 12px; }
.lang-switch select{ background:none; border:none; color:#fff; font-size:12.5px; font-weight:600; font-family:var(--font-body); cursor:pointer; outline:none; }
.lang-switch select option{ color:#111; }

.phone{ position:relative; width:390px; height:820px; background:var(--paper); border-radius:44px; border:8px solid #0d1512; box-shadow:0 30px 70px rgba(0,0,0,0.5); overflow:hidden; }
.phone.lang-ar{ --font-body:'Noto Sans Arabic', sans-serif; --font-display:'Noto Sans Arabic', sans-serif; }
.phone.lang-zh{ --font-body:'Noto Sans SC', sans-serif; --font-display:'Noto Sans SC', sans-serif; }
.notch{ position:absolute; top:0; left:50%; transform:translateX(-50%); width:150px; height:22px; background:#0d1512; border-radius:0 0 16px 16px; z-index:5; }
.statusbar{ display:flex; justify-content:space-between; padding:10px 26px 2px; font-size:12px; font-weight:600; color:var(--ink); direction:ltr; }
.statusbar-dots{ letter-spacing:2px; opacity:0.5; }
.screen{ position:relative; height:calc(100% - 26px); display:flex; flex-direction:column; }
.view{ flex:1; display:flex; flex-direction:column; min-height:0; }
.content{ flex:1; overflow-y:auto; }
.pad{ padding:18px 20px 30px; }

.hello{ display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; gap:10px; }
.eyebrow{ font-size:11.5px; color:var(--ink-soft); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:2px; }
.h1{ font-family:var(--font-display); font-size:22px; font-weight:600; color:var(--ink); line-height:1.2; }
.pin{ display:flex; align-items:center; gap:4px; font-size:11.5px; color:var(--forest); background:var(--sage-bg); padding:5px 9px; border-radius:999px; white-space:nowrap; }

.search{ display:flex; align-items:center; gap:8px; background:var(--surface); border:1px solid var(--line); border-radius:13px; padding:11px 13px; margin-bottom:14px; }
.search input{ border:none; outline:none; background:none; font-size:13.5px; width:100%; font-family:var(--font-body); color:var(--ink); }

.chiprow{ display:flex; gap:8px; overflow-x:auto; padding-bottom:14px; margin-bottom:2px; }
.chiprow::-webkit-scrollbar{ display:none; }
.chip{ display:flex; align-items:center; gap:5px; white-space:nowrap; border:1px solid var(--line); background:var(--surface); color:var(--ink-soft); padding:7px 12px; border-radius:999px; font-size:12.5px; font-weight:500; cursor:pointer; font-family:var(--font-body); }
.chip-on{ background:var(--forest); border-color:var(--forest); color:#fff; }
.chip-locked{ opacity:0.45; cursor:not-allowed; }

.section-title{ font-size:13px; font-weight:700; color:var(--ink); margin:6px 0 10px; }

.grid2{ display:grid; grid-template-columns:1fr 1fr; gap:11px; }
.svc-card{ text-align:start; background:var(--surface); border:1px solid var(--line); border-radius:16px; padding:13px; cursor:pointer; font-family:var(--font-body); }
.svc-icon{ width:34px; height:34px; border-radius:10px; background:var(--sage-bg); display:flex; align-items:center; justify-content:center; margin-bottom:9px; }
.svc-name{ font-size:13px; font-weight:600; color:var(--ink); line-height:1.3; margin-bottom:4px; min-height:32px; }
.svc-certified{ display:flex; align-items:center; gap:4px; font-size:9.5px; font-weight:700; color:var(--forest-dark); background:var(--sage-bg); padding:2px 6px; border-radius:6px; width:fit-content; margin-bottom:6px; }
.svc-meta{ font-size:11px; color:var(--ink-soft); margin-bottom:3px; }
.svc-rating{ display:flex; align-items:center; gap:4px; font-size:11px; color:var(--ink-soft); margin-bottom:10px; }
.svc-cta{ font-size:11.5px; font-weight:700; padding:6px 0; text-align:center; border-radius:8px; }
.cta-quote{ background:var(--amber-bg); color:#8a5c14; }
.cta-book{ background:var(--sage-bg); color:var(--forest-dark); }
.empty{ grid-column:1/-1; color:var(--ink-soft); font-size:13px; padding:20px 0; text-align:center; }

.stat-row{ display:flex; gap:10px; margin:16px 0 18px; }
.stat{ flex:1; background:var(--surface); border:1px solid var(--line); border-radius:13px; padding:12px; text-align:center; }
.stat-num{ font-family:var(--font-mono); font-size:16px; font-weight:500; color:var(--forest); display:flex; align-items:center; justify-content:center; gap:3px; }
.stat-label{ font-size:10.5px; color:var(--ink-soft); margin-top:3px; }

.badge{ font-size:10px; font-weight:700; padding:3px 8px; border-radius:999px; white-space:nowrap; }
.badge-sage{ background:var(--sage-bg); color:var(--forest-dark); }
.badge-forest{ background:var(--forest); color:#fff; }
.badge-amber{ background:var(--amber-bg); color:#8a5c14; }

.ticket{ position:relative; width:100%; display:block; text-align:start; background:var(--surface); border:1px solid var(--line); border-radius:16px; margin-bottom:14px; cursor:pointer; font-family:var(--font-body); overflow:hidden; }
.tear{ height:9px; background-color:var(--surface); background-image:linear-gradient(135deg, var(--paper) 25%, transparent 25%), linear-gradient(225deg, var(--paper) 25%, transparent 25%); background-size:13px 13px; background-position:0 0; }
.ticket-body{ padding:14px 16px 16px; }
.ticket-row{ display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:5px; }
.ticket-title{ font-family:var(--font-display); font-size:15.5px; font-weight:600; color:var(--ink); }
.ticket-sub{ font-size:11.5px; color:var(--ink-soft); }
.ticket-divider{ border-top:1.5px dashed var(--line-strong); margin:11px 0; }
.ticket-foot{ display:flex; justify-content:space-between; align-items:center; font-size:12px; color:var(--ink-soft); }
.waiting{ display:flex; align-items:center; gap:5px; color:var(--amber); font-weight:600; }

.empty-block{ display:flex; flex-direction:column; align-items:center; text-align:center; gap:8px; color:var(--ink-soft); font-size:13px; padding:34px 14px; background:var(--surface); border:1px dashed var(--line-strong); border-radius:16px; }

.quote-card{ background:var(--surface); border:1px solid var(--line); border-radius:14px; padding:13px 14px; margin-bottom:12px; }
.quote-card-booked{ border-color:var(--forest); }
.quote-top{ display:flex; align-items:center; gap:10px; }
.avatar{ width:36px; height:36px; border-radius:50%; background:var(--forest); color:#fff; display:flex; align-items:center; justify-content:center; font-size:12.5px; font-weight:700; flex-shrink:0; }
.avatar-lg{ width:52px; height:52px; font-size:17px; }
.quote-name{ font-size:13.5px; font-weight:600; color:var(--ink); display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.quote-rating{ display:flex; align-items:center; gap:4px; font-size:11.5px; color:var(--ink-soft); margin-top:2px; }
.quote-price{ font-family:var(--font-mono); font-size:15px; font-weight:500; color:var(--forest-dark); }
.quote-msg{ font-size:12.5px; color:var(--ink-soft); font-style:italic; margin:9px 0 10px; line-height:1.5; }

.btn-primary{ width:100%; display:flex; align-items:center; justify-content:center; gap:7px; background:var(--forest); color:#fff; border:none; padding:13px; border-radius:12px; font-size:13.5px; font-weight:700; cursor:pointer; font-family:var(--font-body); }
.btn-secondary{ width:100%; background:var(--sage-bg); color:var(--forest-dark); border:none; padding:10px; border-radius:10px; font-size:12.5px; font-weight:700; cursor:pointer; font-family:var(--font-body); }

.fineprint{ display:flex; align-items:center; gap:6px; font-size:10.5px; color:var(--ink-soft); margin-top:12px; justify-content:center; text-align:center; }

.field-label{ display:block; font-size:11.5px; font-weight:600; color:var(--ink-soft); margin:12px 0 7px; }
.textarea{ width:100%; border:1px solid var(--line); border-radius:12px; padding:11px; font-size:13px; font-family:var(--font-body); color:var(--ink); resize:none; margin-bottom:16px; }

.profile-head{ display:flex; align-items:center; gap:12px; margin-bottom:10px; }
.sheet-blurb{ font-size:13px; color:var(--ink-soft); line-height:1.55; margin:8px 0 14px; }

.star-picker{ display:flex; gap:8px; margin:14px 0 16px; }
.star-picker button{ background:none; border:none; cursor:pointer; padding:0; }

.tabbar{ display:flex; border-top:1px solid var(--line); background:var(--surface); padding:8px 6px 14px; }
.tab{ flex:1; display:flex; flex-direction:column; align-items:center; gap:3px; background:none; border:none; font-size:10px; color:var(--ink-soft); font-family:var(--font-body); font-weight:600; cursor:pointer; }
.tab-on{ color:var(--forest); }
.tab-icon-wrap{ position:relative; }
.tab-badge{ position:absolute; top:-5px; right:-8px; background:var(--amber); color:#fff; font-size:9px; font-weight:700; min-width:15px; height:15px; border-radius:999px; display:flex; align-items:center; justify-content:center; padding:0 3px; }

.sheet-overlay{ position:absolute; inset:0; background:rgba(13,21,18,0.45); display:flex; align-items:flex-end; z-index:20; }
.sheet{ position:relative; width:100%; max-height:88%; background:var(--paper); border-radius:24px 24px 0 0; padding:10px 20px 26px; box-shadow:0 -10px 30px rgba(0,0,0,0.2); }
.sheet-grabber{ width:36px; height:4px; background:var(--line-strong); border-radius:99px; margin:0 auto 10px; }
.sheet-close{ position:absolute; top:12px; inset-inline-end:16px; background:var(--surface); border:1px solid var(--line); width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--ink-soft); }
.sheet-scroll{ overflow-y:auto; max-height:calc(88vh - 40px); padding-top:8px; }
.sheet-icon-lg{ width:44px; height:44px; border-radius:13px; background:var(--sage-bg); display:flex; align-items:center; justify-content:center; margin-bottom:12px; }
.sheet-title{ font-family:var(--font-display); font-size:19px; font-weight:600; color:var(--ink); margin-bottom:4px; }
.sheet-sub{ font-size:12.5px; color:var(--ink-soft); margin-bottom:12px; display:flex; align-items:center; gap:4px; flex-wrap:wrap; }
.price-hint{ font-size:13px; color:var(--ink); background:var(--surface); border:1px solid var(--line); border-radius:10px; padding:10px 12px; margin-bottom:16px; }

.toast{ position:absolute; bottom:90px; left:20px; right:20px; background:var(--ink); color:#fff; font-size:12.5px; font-weight:600; text-align:center; padding:11px; border-radius:11px; z-index:30; box-shadow:0 8px 20px rgba(0,0,0,0.3); }

.fee-row{ display:flex; justify-content:space-between; font-size:12px; color:var(--ink-soft); padding:2px 0; }
.fee-row-net{ font-weight:700; color:var(--forest-dark); }
.invoice-box{ background:var(--surface); border:1px solid var(--line); border-radius:14px; padding:14px 16px; font-family:var(--font-mono); font-size:12px; }
.invoice-row{ display:flex; justify-content:space-between; gap:10px; padding:4px 0; color:var(--ink); }
.invoice-total{ font-weight:700; font-size:13.5px; color:var(--forest-dark); padding-top:8px; }
.segmented-block{ width:100%; margin-bottom:14px; }
.segmented-block button{ flex:1; }
.flexi-box{ background:var(--surface); border:1px solid var(--line); border-radius:14px; padding:14px 16px; margin-bottom:18px; }
.flexi-bar{ width:100%; height:8px; background:var(--sage-bg); border-radius:99px; overflow:hidden; }
.flexi-bar-fill{ height:100%; background:var(--forest); border-radius:99px; }
`;
