import React, { useState, useRef, useEffect, useContext, createContext } from "react";
import {
  Search, Star, MapPin, ChevronRight, X, Check, User, Home, ClipboardList,
  MessageCircle, Send, Briefcase, TrendingUp, ThumbsUp, Clock, ShieldCheck, Globe, BadgeCheck, LogOut, Mail, Lock, Camera,
} from "lucide-react";
import { AuthProvider, useAuth } from "./lib/auth.jsx";
import { fetchCatalog } from "./lib/catalog";
import {
  createServiceRequest,
  fetchCustomerRequests,
  fetchProLeads,
  fetchProJobs,
  sendQuote as sendQuoteApi,
  acceptQuote as acceptQuoteApi,
  markComplete as markCompleteApi,
  submitReview as submitReviewApi,
  subscribeToCustomerRequests,
  subscribeToRequestQuotes,
  subscribeToProLeads,
  subscribeToProQuoteUpdates,
} from "./lib/requests";
import { fetchProServices, updateProServices, updateProProfile, boostProfile, fetchPublicProInfo, fetchReviewsForPro } from "./lib/pros";
import {
  fetchConversations,
  fetchMessages,
  sendMessage,
  markConversationRead,
  subscribeToConversationsForUser,
  subscribeToMessages,
} from "./lib/messages";
import { uploadAvatar } from "./lib/storage";
import { submitReport } from "./lib/reports";
import { uploadPortfolioImage, addPortfolioItem, fetchPortfolioItems, updatePortfolioCaption, deletePortfolioItem } from "./lib/portfolio";
import { addTestimonial, fetchTestimonials, deleteTestimonial } from "./lib/testimonials";
import { uploadRequestPhoto, fetchRequestPhotos } from "./lib/requestPhotos";

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
    authSignInTitle:"Inloggen", authSignUpTitle:"Account aanmaken", authFullNameLabel:"Volledige naam", authEmailLabel:"E-mailadres", authPasswordLabel:"Wachtwoord",
    authSignInBtn:"Inloggen", authSignUpBtn:"Account aanmaken", authSwitchToSignUp:"Nog geen account? Registreer je", authSwitchToSignIn:"Al een account? Log in",
    authCheckEmail:"Controleer je e-mail om je account te bevestigen.", authSignOut:"Uitloggen",
    becomeProPrompt:"Wil je diensten aanbieden op klussie? Stel je vakman-profiel in.", becomeProBtn:"Word vakman", becomeProTitle:"Stel je vakman-profiel in",
    businessNameLabel:"Bedrijfsnaam", vatNumberLabel:"Btw-nummer", bioLabel:"Korte omschrijving", becomeProSubmit:"Start met diensten aanbieden", saveServicesBtn:"Diensten opslaan", messagePlaceholder:"Typ een bericht...",
    editProfileBtn:"Profiel bewerken", editProfileTitle:"Bewerk je profiel", cityLabel:"Stad", saveChangesBtn:"Wijzigingen opslaan", uploadPhotoBtn:"Foto uploaden",
    pauseProfileBtn:"Profiel pauzeren", resumeProfileBtn:"Profiel hervatten", pausedBannerTitle:"Je profiel is gepauzeerd", pausedBannerMsg:"Je ontvangt geen nieuwe aanvragen zolang je profiel gepauzeerd is.",
    reportIssueBtn:"Meld een probleem", reportReasonLabel:"Reden", reportReasonNoShow:"Kwam niet opdagen", reportReasonPoorQuality:"Slechte kwaliteit", reportReasonBillingIssue:"Facturatieprobleem", reportReasonOther:"Andere",
    reportDetailsLabel:"Details (optioneel)", reportSubmitBtn:"Melding versturen", reportSentMsg:"Melding verzonden.", trustScoreLabel:"Vertrouwensscore",
    portfolioTitle:"Portfolio", captionLabel:"Bijschrift (optioneel)", noPortfolioYet:"Nog geen foto's.", deletePhotoBtn:"Foto verwijderen",
    testimonialsTitle:"Getuigenissen", addTestimonialBtn:"Getuigenis toevoegen", clientNameLabel:"Naam klant (optioneel)", testimonialTextLabel:"Wat zeiden ze?",
    unverifiedTestimonialNote:"Gedeeld door de vakman — niet geverifieerd door klussie.", noTestimonialsYet:"Nog geen getuigenissen.", deleteBtn:"Verwijderen",
    proReviewsTitle:"Beoordelingen", certifiedBadge:"Gecertifieerd",
    jobDetailsTitle:"Details van de klus", jobPhotosLabel:"Foto's van de klus (optioneel)", yesLabel:"Ja", noLabel:"Nee",
    fieldRooms:"Aantal kamers", fieldSqm:"Oppervlakte (m²)", fieldCeilingIncluded:"Plafond mee schilderen?", fieldTrimIncluded:"Deuren/plinten mee schilderen?",
    fieldFloorNumber:"Verdieping", fieldElevatorAccess:"Lift aanwezig?", fieldDistanceKm:"Afstand (km)", fieldBedrooms:"Aantal slaapkamers", fieldRecurring:"Terugkerende schoonmaak?",
    fieldKitchenLength:"Lengte kastenwand (m)", fieldMaterialPref:"Materiaalvoorkeur", fieldRoomType:"Type ruimte", fieldRemovalNeeded:"Oude bekleding verwijderen?",
    fieldItemsCount:"Aantal stukken", fieldSessionsPerWeek:"Lessen per week", fieldLevel:"Niveau", fieldOutletsCount:"Aantal aansluitpunten", fieldFullRewiring:"Volledige herbekabeling?", fieldJobType:"Type probleem",
    optLaminate:"Laminaat", optWood:"Hout", optLacquer:"Lak", optBathroom:"Badkamer", optKitchen:"Keuken", optTerrace:"Terras", optOther:"Andere",
    optBeginner:"Beginner", optIntermediate:"Gevorderd", optAdvanced:"Vergevorderd", optLeak:"Lekkage", optClog:"Verstopping", optInstallation:"Nieuwe installatie",
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
    authSignInTitle:"Se connecter", authSignUpTitle:"Créer un compte", authFullNameLabel:"Nom complet", authEmailLabel:"Adresse e-mail", authPasswordLabel:"Mot de passe",
    authSignInBtn:"Se connecter", authSignUpBtn:"Créer un compte", authSwitchToSignUp:"Pas encore de compte ? Inscris-toi", authSwitchToSignIn:"Déjà un compte ? Connecte-toi",
    authCheckEmail:"Vérifie tes e-mails pour confirmer ton compte.", authSignOut:"Se déconnecter",
    becomeProPrompt:"Tu veux proposer des services sur klussie ? Configure ton profil pro.", becomeProBtn:"Devenir pro", becomeProTitle:"Configure ton profil pro",
    businessNameLabel:"Nom de l'entreprise", vatNumberLabel:"Numéro de TVA", bioLabel:"Courte description", becomeProSubmit:"Commencer à proposer des services", saveServicesBtn:"Enregistrer les services", messagePlaceholder:"Écris un message...",
    editProfileBtn:"Modifier le profil", editProfileTitle:"Modifie ton profil", cityLabel:"Ville", saveChangesBtn:"Enregistrer les modifications", uploadPhotoBtn:"Téléverser une photo",
    pauseProfileBtn:"Mettre en pause", resumeProfileBtn:"Réactiver le profil", pausedBannerTitle:"Ton profil est en pause", pausedBannerMsg:"Tu ne reçois pas de nouvelles demandes tant que ton profil est en pause.",
    reportIssueBtn:"Signaler un problème", reportReasonLabel:"Motif", reportReasonNoShow:"Ne s'est pas présenté", reportReasonPoorQuality:"Mauvaise qualité", reportReasonBillingIssue:"Problème de facturation", reportReasonOther:"Autre",
    reportDetailsLabel:"Détails (facultatif)", reportSubmitBtn:"Envoyer le signalement", reportSentMsg:"Signalement envoyé.", trustScoreLabel:"Score de confiance",
    portfolioTitle:"Portfolio", captionLabel:"Légende (facultatif)", noPortfolioYet:"Pas encore de photos.", deletePhotoBtn:"Supprimer la photo",
    testimonialsTitle:"Témoignages", addTestimonialBtn:"Ajouter un témoignage", clientNameLabel:"Nom du client (facultatif)", testimonialTextLabel:"Qu'ont-ils dit ?",
    unverifiedTestimonialNote:"Partagé par le professionnel — non vérifié par klussie.", noTestimonialsYet:"Pas encore de témoignages.", deleteBtn:"Supprimer",
    proReviewsTitle:"Avis", certifiedBadge:"Certifié",
    jobDetailsTitle:"Détails du chantier", jobPhotosLabel:"Photos du chantier (optionnel)", yesLabel:"Oui", noLabel:"Non",
    fieldRooms:"Nombre de pièces", fieldSqm:"Surface (m²)", fieldCeilingIncluded:"Plafond inclus ?", fieldTrimIncluded:"Portes/plinthes incluses ?",
    fieldFloorNumber:"Étage", fieldElevatorAccess:"Ascenseur disponible ?", fieldDistanceKm:"Distance (km)", fieldBedrooms:"Nombre de chambres", fieldRecurring:"Nettoyage récurrent ?",
    fieldKitchenLength:"Longueur des meubles (m)", fieldMaterialPref:"Matériau préféré", fieldRoomType:"Type de pièce", fieldRemovalNeeded:"Retrait de l'ancien revêtement ?",
    fieldItemsCount:"Nombre de pièces/meubles", fieldSessionsPerWeek:"Cours par semaine", fieldLevel:"Niveau", fieldOutletsCount:"Nombre de points de raccordement", fieldFullRewiring:"Recâblage complet ?", fieldJobType:"Type de problème",
    optLaminate:"Stratifié", optWood:"Bois", optLacquer:"Laqué", optBathroom:"Salle de bain", optKitchen:"Cuisine", optTerrace:"Terrasse", optOther:"Autre",
    optBeginner:"Débutant", optIntermediate:"Intermédiaire", optAdvanced:"Avancé", optLeak:"Fuite", optClog:"Bouchon", optInstallation:"Nouvelle installation",
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
    authSignInTitle:"Anmelden", authSignUpTitle:"Konto erstellen", authFullNameLabel:"Vollständiger Name", authEmailLabel:"E-Mail-Adresse", authPasswordLabel:"Passwort",
    authSignInBtn:"Anmelden", authSignUpBtn:"Konto erstellen", authSwitchToSignUp:"Noch kein Konto? Registrieren", authSwitchToSignIn:"Schon ein Konto? Anmelden",
    authCheckEmail:"Bestätige dein Konto über den Link in deiner E-Mail.", authSignOut:"Abmelden",
    becomeProPrompt:"Möchtest du Dienstleistungen auf klussie anbieten? Richte dein Profi-Profil ein.", becomeProBtn:"Profi werden", becomeProTitle:"Richte dein Profi-Profil ein",
    businessNameLabel:"Firmenname", vatNumberLabel:"USt-IdNr.", bioLabel:"Kurzbeschreibung", becomeProSubmit:"Jetzt Dienstleistungen anbieten", saveServicesBtn:"Dienste speichern", messagePlaceholder:"Nachricht schreiben...",
    editProfileBtn:"Profil bearbeiten", editProfileTitle:"Profil bearbeiten", cityLabel:"Stadt", saveChangesBtn:"Änderungen speichern", uploadPhotoBtn:"Foto hochladen",
    pauseProfileBtn:"Profil pausieren", resumeProfileBtn:"Profil fortsetzen", pausedBannerTitle:"Dein Profil ist pausiert", pausedBannerMsg:"Du erhältst keine neuen Anfragen, solange dein Profil pausiert ist.",
    reportIssueBtn:"Problem melden", reportReasonLabel:"Grund", reportReasonNoShow:"Nicht erschienen", reportReasonPoorQuality:"Schlechte Qualität", reportReasonBillingIssue:"Abrechnungsproblem", reportReasonOther:"Sonstiges",
    reportDetailsLabel:"Details (optional)", reportSubmitBtn:"Meldung senden", reportSentMsg:"Meldung gesendet.", trustScoreLabel:"Vertrauensscore",
    portfolioTitle:"Portfolio", captionLabel:"Bildunterschrift (optional)", noPortfolioYet:"Noch keine Fotos.", deletePhotoBtn:"Foto löschen",
    testimonialsTitle:"Referenzen", addTestimonialBtn:"Referenz hinzufügen", clientNameLabel:"Kundenname (optional)", testimonialTextLabel:"Was haben sie gesagt?",
    unverifiedTestimonialNote:"Vom Profi geteilt — nicht von klussie verifiziert.", noTestimonialsYet:"Noch keine Referenzen.", deleteBtn:"Löschen",
    proReviewsTitle:"Bewertungen", certifiedBadge:"Zertifiziert",
    jobDetailsTitle:"Details zum Auftrag", jobPhotosLabel:"Fotos vom Auftrag (optional)", yesLabel:"Ja", noLabel:"Nein",
    fieldRooms:"Anzahl Zimmer", fieldSqm:"Fläche (m²)", fieldCeilingIncluded:"Decke mitstreichen?", fieldTrimIncluded:"Türen/Leisten mitstreichen?",
    fieldFloorNumber:"Stockwerk", fieldElevatorAccess:"Aufzug vorhanden?", fieldDistanceKm:"Entfernung (km)", fieldBedrooms:"Anzahl Schlafzimmer", fieldRecurring:"Wiederkehrende Reinigung?",
    fieldKitchenLength:"Länge der Schrankwand (m)", fieldMaterialPref:"Materialwunsch", fieldRoomType:"Raumtyp", fieldRemovalNeeded:"Alten Belag entfernen?",
    fieldItemsCount:"Anzahl Stücke", fieldSessionsPerWeek:"Stunden pro Woche", fieldLevel:"Niveau", fieldOutletsCount:"Anzahl Anschlusspunkte", fieldFullRewiring:"Komplette Neuverkabelung?", fieldJobType:"Art des Problems",
    optLaminate:"Laminat", optWood:"Holz", optLacquer:"Lackiert", optBathroom:"Badezimmer", optKitchen:"Küche", optTerrace:"Terrasse", optOther:"Sonstiges",
    optBeginner:"Anfänger", optIntermediate:"Fortgeschritten", optAdvanced:"Sehr fortgeschritten", optLeak:"Leck", optClog:"Verstopfung", optInstallation:"Neuinstallation",
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
    authSignInTitle:"Sign in", authSignUpTitle:"Create account", authFullNameLabel:"Full name", authEmailLabel:"Email address", authPasswordLabel:"Password",
    authSignInBtn:"Sign in", authSignUpBtn:"Create account", authSwitchToSignUp:"No account yet? Sign up", authSwitchToSignIn:"Already have an account? Sign in",
    authCheckEmail:"Check your email to confirm your account.", authSignOut:"Sign out",
    becomeProPrompt:"Want to offer services on klussie? Set up your pro profile.", becomeProBtn:"Become a pro", becomeProTitle:"Set up your pro profile",
    businessNameLabel:"Business name", vatNumberLabel:"VAT number", bioLabel:"Short bio", becomeProSubmit:"Start offering services", saveServicesBtn:"Save services", messagePlaceholder:"Type a message...",
    editProfileBtn:"Edit profile", editProfileTitle:"Edit your profile", cityLabel:"City", saveChangesBtn:"Save changes", uploadPhotoBtn:"Upload photo",
    pauseProfileBtn:"Pause profile", resumeProfileBtn:"Resume profile", pausedBannerTitle:"Your profile is paused", pausedBannerMsg:"You won't receive new leads while your profile is paused.",
    reportIssueBtn:"Report an issue", reportReasonLabel:"Reason", reportReasonNoShow:"Didn't show up", reportReasonPoorQuality:"Poor quality work", reportReasonBillingIssue:"Billing issue", reportReasonOther:"Other",
    reportDetailsLabel:"Details (optional)", reportSubmitBtn:"Submit report", reportSentMsg:"Report submitted.", trustScoreLabel:"Trust score",
    portfolioTitle:"Portfolio", captionLabel:"Caption (optional)", noPortfolioYet:"No photos yet.", deletePhotoBtn:"Delete photo",
    testimonialsTitle:"Testimonials", addTestimonialBtn:"Add testimonial", clientNameLabel:"Client name (optional)", testimonialTextLabel:"What did they say?",
    unverifiedTestimonialNote:"Shared by the pro — not verified by klussie.", noTestimonialsYet:"No testimonials yet.", deleteBtn:"Delete",
    proReviewsTitle:"Reviews", certifiedBadge:"Certified",
    jobDetailsTitle:"Job details", jobPhotosLabel:"Photos of the job (optional)", yesLabel:"Yes", noLabel:"No",
    fieldRooms:"Number of rooms", fieldSqm:"Area (m²)", fieldCeilingIncluded:"Include ceiling?", fieldTrimIncluded:"Include doors/trim?",
    fieldFloorNumber:"Floor number", fieldElevatorAccess:"Elevator available?", fieldDistanceKm:"Distance (km)", fieldBedrooms:"Number of bedrooms", fieldRecurring:"Recurring cleaning?",
    fieldKitchenLength:"Cabinet run length (m)", fieldMaterialPref:"Material preference", fieldRoomType:"Room type", fieldRemovalNeeded:"Remove old covering?",
    fieldItemsCount:"Number of items", fieldSessionsPerWeek:"Sessions per week", fieldLevel:"Level", fieldOutletsCount:"Number of connection points", fieldFullRewiring:"Full rewiring?", fieldJobType:"Issue type",
    optLaminate:"Laminate", optWood:"Wood", optLacquer:"Lacquered", optBathroom:"Bathroom", optKitchen:"Kitchen", optTerrace:"Terrace", optOther:"Other",
    optBeginner:"Beginner", optIntermediate:"Intermediate", optAdvanced:"Advanced", optLeak:"Leak", optClog:"Clog", optInstallation:"New installation",
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
    authSignInTitle:"تسجيل الدخول", authSignUpTitle:"إنشاء حساب", authFullNameLabel:"الاسم الكامل", authEmailLabel:"البريد الإلكتروني", authPasswordLabel:"كلمة المرور",
    authSignInBtn:"تسجيل الدخول", authSignUpBtn:"إنشاء حساب", authSwitchToSignUp:"ليس لديك حساب؟ سجّل الآن", authSwitchToSignIn:"لديك حساب بالفعل؟ سجّل الدخول",
    authCheckEmail:"تحقق من بريدك الإلكتروني لتأكيد حسابك.", authSignOut:"تسجيل الخروج",
    becomeProPrompt:"تريد تقديم خدمات على klussie؟ أنشئ ملفك كمحترف.", becomeProBtn:"كن محترفًا", becomeProTitle:"أنشئ ملفك كمحترف",
    businessNameLabel:"اسم الشركة", vatNumberLabel:"الرقم الضريبي", bioLabel:"نبذة قصيرة", becomeProSubmit:"ابدأ بتقديم الخدمات", saveServicesBtn:"حفظ الخدمات", messagePlaceholder:"اكتب رسالة...",
    editProfileBtn:"تعديل الملف الشخصي", editProfileTitle:"عدّل ملفك الشخصي", cityLabel:"المدينة", saveChangesBtn:"حفظ التغييرات", uploadPhotoBtn:"تحميل صورة",
    pauseProfileBtn:"إيقاف الملف مؤقتًا", resumeProfileBtn:"استئناف الملف", pausedBannerTitle:"ملفك متوقف مؤقتًا", pausedBannerMsg:"لن تتلقى طلبات جديدة طالما ملفك متوقف مؤقتًا.",
    reportIssueBtn:"الإبلاغ عن مشكلة", reportReasonLabel:"السبب", reportReasonNoShow:"لم يحضر", reportReasonPoorQuality:"جودة عمل سيئة", reportReasonBillingIssue:"مشكلة في الفوترة", reportReasonOther:"أخرى",
    reportDetailsLabel:"تفاصيل (اختياري)", reportSubmitBtn:"إرسال البلاغ", reportSentMsg:"تم إرسال البلاغ.", trustScoreLabel:"درجة الثقة",
    portfolioTitle:"معرض الأعمال", captionLabel:"تعليق (اختياري)", noPortfolioYet:"لا توجد صور بعد.", deletePhotoBtn:"حذف الصورة",
    testimonialsTitle:"شهادات العملاء", addTestimonialBtn:"إضافة شهادة", clientNameLabel:"اسم العميل (اختياري)", testimonialTextLabel:"ماذا قالوا؟",
    unverifiedTestimonialNote:"شاركها المحترف — غير موثقة من قبل klussie.", noTestimonialsYet:"لا توجد شهادات بعد.", deleteBtn:"حذف",
    proReviewsTitle:"التقييمات", certifiedBadge:"معتمد",
    jobDetailsTitle:"تفاصيل العمل", jobPhotosLabel:"صور العمل (اختياري)", yesLabel:"نعم", noLabel:"لا",
    fieldRooms:"عدد الغرف", fieldSqm:"المساحة (م²)", fieldCeilingIncluded:"هل يشمل السقف؟", fieldTrimIncluded:"هل تشمل الأبواب/الإطارات؟",
    fieldFloorNumber:"رقم الطابق", fieldElevatorAccess:"هل يوجد مصعد؟", fieldDistanceKm:"المسافة (كم)", fieldBedrooms:"عدد غرف النوم", fieldRecurring:"تنظيف متكرر؟",
    fieldKitchenLength:"طول خط الخزائن (م)", fieldMaterialPref:"تفضيل المادة", fieldRoomType:"نوع الغرفة", fieldRemovalNeeded:"إزالة الكسوة القديمة؟",
    fieldItemsCount:"عدد القطع", fieldSessionsPerWeek:"عدد الحصص أسبوعيًا", fieldLevel:"المستوى", fieldOutletsCount:"عدد نقاط التوصيل", fieldFullRewiring:"إعادة تمديد كاملة؟", fieldJobType:"نوع المشكلة",
    optLaminate:"لامينيت", optWood:"خشب", optLacquer:"مطلي بالورنيش", optBathroom:"حمام", optKitchen:"مطبخ", optTerrace:"شرفة", optOther:"أخرى",
    optBeginner:"مبتدئ", optIntermediate:"متوسط", optAdvanced:"متقدم", optLeak:"تسريب", optClog:"انسداد", optInstallation:"تركيب جديد",
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
    authSignInTitle:"Giriş yap", authSignUpTitle:"Hesap oluştur", authFullNameLabel:"Ad soyad", authEmailLabel:"E-posta adresi", authPasswordLabel:"Şifre",
    authSignInBtn:"Giriş yap", authSignUpBtn:"Hesap oluştur", authSwitchToSignUp:"Hesabın yok mu? Kaydol", authSwitchToSignIn:"Zaten hesabın var mı? Giriş yap",
    authCheckEmail:"Hesabını onaylamak için e-postanı kontrol et.", authSignOut:"Çıkış yap",
    becomeProPrompt:"klussie'de hizmet sunmak mı istiyorsun? Profesyonel profilini oluştur.", becomeProBtn:"Profesyonel ol", becomeProTitle:"Profesyonel profilini oluştur",
    businessNameLabel:"Şirket adı", vatNumberLabel:"KDV numarası", bioLabel:"Kısa biyografi", becomeProSubmit:"Hizmet sunmaya başla", saveServicesBtn:"Hizmetleri kaydet", messagePlaceholder:"Bir mesaj yaz...",
    editProfileBtn:"Profili düzenle", editProfileTitle:"Profilini düzenle", cityLabel:"Şehir", saveChangesBtn:"Değişiklikleri kaydet", uploadPhotoBtn:"Fotoğraf yükle",
    pauseProfileBtn:"Profili duraklat", resumeProfileBtn:"Profili devam ettir", pausedBannerTitle:"Profilin duraklatıldı", pausedBannerMsg:"Profilin duraklatıldığı sürece yeni talep almazsın.",
    reportIssueBtn:"Sorun bildir", reportReasonLabel:"Neden", reportReasonNoShow:"Gelmedi", reportReasonPoorQuality:"Kötü iş kalitesi", reportReasonBillingIssue:"Faturalama sorunu", reportReasonOther:"Diğer",
    reportDetailsLabel:"Detaylar (isteğe bağlı)", reportSubmitBtn:"Bildirimi gönder", reportSentMsg:"Bildirim gönderildi.", trustScoreLabel:"Güven puanı",
    portfolioTitle:"Portfolyo", captionLabel:"Açıklama (isteğe bağlı)", noPortfolioYet:"Henüz fotoğraf yok.", deletePhotoBtn:"Fotoğrafı sil",
    testimonialsTitle:"Referanslar", addTestimonialBtn:"Referans ekle", clientNameLabel:"Müşteri adı (isteğe bağlı)", testimonialTextLabel:"Ne söylediler?",
    unverifiedTestimonialNote:"Profesyonel tarafından paylaşıldı — klussie tarafından doğrulanmadı.", noTestimonialsYet:"Henüz referans yok.", deleteBtn:"Sil",
    proReviewsTitle:"Değerlendirmeler", certifiedBadge:"Sertifikalı",
    jobDetailsTitle:"İş detayları", jobPhotosLabel:"İşin fotoğrafları (isteğe bağlı)", yesLabel:"Evet", noLabel:"Hayır",
    fieldRooms:"Oda sayısı", fieldSqm:"Alan (m²)", fieldCeilingIncluded:"Tavan dahil mi?", fieldTrimIncluded:"Kapı/süpürgelik dahil mi?",
    fieldFloorNumber:"Kat numarası", fieldElevatorAccess:"Asansör var mı?", fieldDistanceKm:"Mesafe (km)", fieldBedrooms:"Yatak odası sayısı", fieldRecurring:"Tekrarlayan temizlik mi?",
    fieldKitchenLength:"Dolap hattı uzunluğu (m)", fieldMaterialPref:"Malzeme tercihi", fieldRoomType:"Oda türü", fieldRemovalNeeded:"Eski kaplama sökülsün mü?",
    fieldItemsCount:"Parça sayısı", fieldSessionsPerWeek:"Haftalık ders sayısı", fieldLevel:"Seviye", fieldOutletsCount:"Bağlantı noktası sayısı", fieldFullRewiring:"Tam yeniden kablolama mı?", fieldJobType:"Sorun türü",
    optLaminate:"Laminat", optWood:"Ahşap", optLacquer:"Lake", optBathroom:"Banyo", optKitchen:"Mutfak", optTerrace:"Teras", optOther:"Diğer",
    optBeginner:"Başlangıç", optIntermediate:"Orta", optAdvanced:"İleri", optLeak:"Sızıntı", optClog:"Tıkanıklık", optInstallation:"Yeni kurulum",
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
    authSignInTitle:"Войти", authSignUpTitle:"Создать аккаунт", authFullNameLabel:"Полное имя", authEmailLabel:"Электронная почта", authPasswordLabel:"Пароль",
    authSignInBtn:"Войти", authSignUpBtn:"Создать аккаунт", authSwitchToSignUp:"Нет аккаунта? Зарегистрируйтесь", authSwitchToSignIn:"Уже есть аккаунт? Войдите",
    authCheckEmail:"Проверьте почту, чтобы подтвердить аккаунт.", authSignOut:"Выйти",
    becomeProPrompt:"Хотите предлагать услуги на klussie? Настройте профиль специалиста.", becomeProBtn:"Стать специалистом", becomeProTitle:"Настройте профиль специалиста",
    businessNameLabel:"Название компании", vatNumberLabel:"Номер плательщика НДС", bioLabel:"Краткое описание", becomeProSubmit:"Начать предлагать услуги", saveServicesBtn:"Сохранить услуги", messagePlaceholder:"Введите сообщение...",
    editProfileBtn:"Редактировать профиль", editProfileTitle:"Редактируйте свой профиль", cityLabel:"Город", saveChangesBtn:"Сохранить изменения", uploadPhotoBtn:"Загрузить фото",
    pauseProfileBtn:"Приостановить профиль", resumeProfileBtn:"Возобновить профиль", pausedBannerTitle:"Ваш профиль приостановлен", pausedBannerMsg:"Пока профиль приостановлен, вы не будете получать новые заявки.",
    reportIssueBtn:"Пожаловаться", reportReasonLabel:"Причина", reportReasonNoShow:"Не пришёл", reportReasonPoorQuality:"Плохое качество работы", reportReasonBillingIssue:"Проблема с оплатой", reportReasonOther:"Другое",
    reportDetailsLabel:"Детали (необязательно)", reportSubmitBtn:"Отправить жалобу", reportSentMsg:"Жалоба отправлена.", trustScoreLabel:"Рейтинг доверия",
    portfolioTitle:"Портфолио", captionLabel:"Подпись (необязательно)", noPortfolioYet:"Пока нет фотографий.", deletePhotoBtn:"Удалить фото",
    testimonialsTitle:"Отзывы клиентов", addTestimonialBtn:"Добавить отзыв", clientNameLabel:"Имя клиента (необязательно)", testimonialTextLabel:"Что они сказали?",
    unverifiedTestimonialNote:"Добавлено специалистом — не проверено klussie.", noTestimonialsYet:"Пока нет отзывов.", deleteBtn:"Удалить",
    proReviewsTitle:"Отзывы", certifiedBadge:"Сертифицирован",
    jobDetailsTitle:"Детали работы", jobPhotosLabel:"Фото объекта (необязательно)", yesLabel:"Да", noLabel:"Нет",
    fieldRooms:"Количество комнат", fieldSqm:"Площадь (м²)", fieldCeilingIncluded:"Включая потолок?", fieldTrimIncluded:"Включая двери/плинтусы?",
    fieldFloorNumber:"Этаж", fieldElevatorAccess:"Есть лифт?", fieldDistanceKm:"Расстояние (км)", fieldBedrooms:"Количество спален", fieldRecurring:"Регулярная уборка?",
    fieldKitchenLength:"Длина шкафов (м)", fieldMaterialPref:"Предпочтение материала", fieldRoomType:"Тип помещения", fieldRemovalNeeded:"Удалить старое покрытие?",
    fieldItemsCount:"Количество предметов", fieldSessionsPerWeek:"Занятий в неделю", fieldLevel:"Уровень", fieldOutletsCount:"Количество точек подключения", fieldFullRewiring:"Полная замена проводки?", fieldJobType:"Тип проблемы",
    optLaminate:"Ламинат", optWood:"Дерево", optLacquer:"Лакированный", optBathroom:"Ванная", optKitchen:"Кухня", optTerrace:"Терраса", optOther:"Другое",
    optBeginner:"Начинающий", optIntermediate:"Средний", optAdvanced:"Продвинутый", optLeak:"Протечка", optClog:"Засор", optInstallation:"Новая установка",
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
    authSignInTitle:"登录", authSignUpTitle:"创建账户", authFullNameLabel:"姓名", authEmailLabel:"电子邮箱", authPasswordLabel:"密码",
    authSignInBtn:"登录", authSignUpBtn:"创建账户", authSwitchToSignUp:"还没有账户？注册", authSwitchToSignIn:"已有账户？登录",
    authCheckEmail:"请查收邮件以确认你的账户。", authSignOut:"退出登录",
    becomeProPrompt:"想在 klussie 上提供服务吗？设置你的专业人士资料。", becomeProBtn:"成为专业人士", becomeProTitle:"设置你的专业人士资料",
    businessNameLabel:"公司名称", vatNumberLabel:"增值税号", bioLabel:"简介", becomeProSubmit:"开始提供服务", saveServicesBtn:"保存服务", messagePlaceholder:"输入消息...",
    editProfileBtn:"编辑资料", editProfileTitle:"编辑你的资料", cityLabel:"城市", saveChangesBtn:"保存更改", uploadPhotoBtn:"上传照片",
    pauseProfileBtn:"暂停资料", resumeProfileBtn:"恢复资料", pausedBannerTitle:"你的资料已暂停", pausedBannerMsg:"资料暂停期间你不会收到新的需求。",
    reportIssueBtn:"举报问题", reportReasonLabel:"原因", reportReasonNoShow:"未到场", reportReasonPoorQuality:"工作质量差", reportReasonBillingIssue:"账单问题", reportReasonOther:"其他",
    reportDetailsLabel:"详情（可选）", reportSubmitBtn:"提交举报", reportSentMsg:"举报已提交。", trustScoreLabel:"信任分数",
    portfolioTitle:"作品集", captionLabel:"说明（可选）", noPortfolioYet:"暂无照片。", deletePhotoBtn:"删除照片",
    testimonialsTitle:"客户评价", addTestimonialBtn:"添加评价", clientNameLabel:"客户姓名（可选）", testimonialTextLabel:"他们说了什么？",
    unverifiedTestimonialNote:"由专业人士分享 — 未经 klussie 验证。", noTestimonialsYet:"暂无客户评价。", deleteBtn:"删除",
    proReviewsTitle:"评价", certifiedBadge:"已认证",
    jobDetailsTitle:"工作详情", jobPhotosLabel:"工作照片（可选）", yesLabel:"是", noLabel:"否",
    fieldRooms:"房间数量", fieldSqm:"面积（平方米）", fieldCeilingIncluded:"是否包含天花板？", fieldTrimIncluded:"是否包含门/踢脚线？",
    fieldFloorNumber:"楼层", fieldElevatorAccess:"是否有电梯？", fieldDistanceKm:"距离（公里）", fieldBedrooms:"卧室数量", fieldRecurring:"是否定期清洁？",
    fieldKitchenLength:"橱柜长度（米）", fieldMaterialPref:"材料偏好", fieldRoomType:"房间类型", fieldRemovalNeeded:"是否需要拆除旧铺面？",
    fieldItemsCount:"件数", fieldSessionsPerWeek:"每周课时数", fieldLevel:"水平", fieldOutletsCount:"接线点数量", fieldFullRewiring:"是否需要全部重新布线？", fieldJobType:"问题类型",
    optLaminate:"复合板", optWood:"实木", optLacquer:"烤漆", optBathroom:"浴室", optKitchen:"厨房", optTerrace:"露台", optOther:"其他",
    optBeginner:"初级", optIntermediate:"中级", optAdvanced:"高级", optLeak:"漏水", optClog:"堵塞", optInstallation:"新安装",
  },
};

/* ---------------------------------- DATA ---------------------------------- */

const PLATFORM_COMMISSION_RATE = 0.12;
const FLEXI_TAX_FREE_THRESHOLD = 18440;
const BOOST_WEEKLY_PRICE = 9;

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

function Avatar({ url, initials, size }) {
  return (
    <div className={"avatar" + (size ? ` avatar-${size}` : "")}>
      {url ? <img src={url} alt="" /> : initials}
    </div>
  );
}

function trustScore({ rating = 0, isCertified, badgeTier }) {
  const badgeBonus = badgeTier === "elite" ? 12 : badgeTier === "top" ? 6 : 0;
  const score = rating * 20 + (isCertified ? 8 : 0) + badgeBonus;
  return Math.max(0, Math.min(100, Math.round(score)));
}

const REPORT_REASONS = ["no_show", "poor_quality", "billing_issue", "other"];

/* ---------------------------------- APP ---------------------------------- */

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

const WHEN_PREFS = ["this_week", "next_week", "flexible"];

// Structured job-detail questions per service, keyed by the fixed seed UUIDs from
// 0001_init.sql — lets customers describe a job (rooms, m², etc.) with quick taps
// instead of writing it all out in the freeform details textarea. Services not listed
// here (the 4 specialist/consultative ones) keep freeform-only, since there's no
// universal quantifiable field for them.
const SERVICE_QUESTIONS = {
  "00000000-0000-0000-0000-000000000001": [ // Schilderwerken
    { key: "rooms", type: "number", label: "fieldRooms", placeholder: "3" },
    { key: "sqm", type: "number", label: "fieldSqm", placeholder: "20" },
    { key: "ceilingIncluded", type: "boolean", label: "fieldCeilingIncluded" },
    { key: "trimIncluded", type: "boolean", label: "fieldTrimIncluded" },
  ],
  "00000000-0000-0000-0000-000000000002": [ // Verhuisservice
    { key: "rooms", type: "number", label: "fieldRooms", placeholder: "3" },
    { key: "floorNumber", type: "number", label: "fieldFloorNumber", placeholder: "2" },
    { key: "elevatorAccess", type: "boolean", label: "fieldElevatorAccess" },
    { key: "distanceKm", type: "number", label: "fieldDistanceKm", placeholder: "15" },
  ],
  "00000000-0000-0000-0000-000000000003": [ // Woningreiniging
    { key: "sqm", type: "number", label: "fieldSqm", placeholder: "80" },
    { key: "bedrooms", type: "number", label: "fieldBedrooms", placeholder: "2" },
    { key: "recurring", type: "boolean", label: "fieldRecurring" },
  ],
  "00000000-0000-0000-0000-000000000004": [ // Ontruimingsschoonmaak
    { key: "sqm", type: "number", label: "fieldSqm", placeholder: "80" },
    { key: "bedrooms", type: "number", label: "fieldBedrooms", placeholder: "2" },
  ],
  "00000000-0000-0000-0000-000000000005": [ // Keukenkasten op maat
    { key: "kitchenLength", type: "number", label: "fieldKitchenLength", placeholder: "4" },
    { key: "materialPref", type: "select", label: "fieldMaterialPref", options: [
      { value: "laminate", label: "optLaminate" }, { value: "wood", label: "optWood" }, { value: "lacquer", label: "optLacquer" },
    ] },
  ],
  "00000000-0000-0000-0000-000000000006": [ // Tegelwerken
    { key: "sqm", type: "number", label: "fieldSqm", placeholder: "15" },
    { key: "roomType", type: "select", label: "fieldRoomType", options: [
      { value: "bathroom", label: "optBathroom" }, { value: "kitchen", label: "optKitchen" }, { value: "terrace", label: "optTerrace" }, { value: "other", label: "optOther" },
    ] },
    { key: "removalNeeded", type: "boolean", label: "fieldRemovalNeeded" },
  ],
  "00000000-0000-0000-0000-000000000007": [ // Meubeltransport
    { key: "itemsCount", type: "number", label: "fieldItemsCount", placeholder: "1" },
    { key: "elevatorAccess", type: "boolean", label: "fieldElevatorAccess" },
  ],
  "00000000-0000-0000-0000-000000000008": [ // Engelse bijles
    { key: "sessionsPerWeek", type: "number", label: "fieldSessionsPerWeek", placeholder: "1" },
    { key: "level", type: "select", label: "fieldLevel", options: [
      { value: "beginner", label: "optBeginner" }, { value: "intermediate", label: "optIntermediate" }, { value: "advanced", label: "optAdvanced" },
    ] },
  ],
  "00000000-0000-0000-0000-000000000009": [ // Elektriciteitswerken
    { key: "outletsCount", type: "number", label: "fieldOutletsCount", placeholder: "4" },
    { key: "fullRewiring", type: "boolean", label: "fieldFullRewiring" },
  ],
  "00000000-0000-0000-0000-000000000010": [ // Zetel- en tapijtreiniging
    { key: "itemsCount", type: "number", label: "fieldItemsCount", placeholder: "1" },
  ],
  "00000000-0000-0000-0000-000000000011": [ // Loodgieterswerken
    { key: "jobType", type: "select", label: "fieldJobType", options: [
      { value: "leak", label: "optLeak" }, { value: "clog", label: "optClog" }, { value: "installation", label: "optInstallation" }, { value: "other", label: "optOther" },
    ] },
  ],
};

function fieldValueLabel(field, value, t) {
  if (value === undefined || value === null || value === "") return null;
  if (field.type === "boolean") return value ? t.yesLabel : t.noLabel;
  if (field.type === "select") return t[field.options.find((o) => o.value === value)?.label] || value;
  return String(value);
}

// Renders the structured answers (if any) as a compact label:value list, shown to both
// the customer (their own request) and pros (leads/quote review) alongside the freeform
// details text.
function JobDetailsSummary({ serviceId, fields }) {
  const { t } = useLang();
  const questions = SERVICE_QUESTIONS[serviceId];
  if (!questions || !fields) return null;
  const rows = questions
    .map((f) => ({ label: t[f.label], value: fieldValueLabel(f, fields[f.key], t) }))
    .filter((r) => r.value !== null);
  if (rows.length === 0) return null;
  return (
    <div className="job-details-summary">
      {rows.map((r) => (
        <div key={r.label} className="job-details-row"><span>{r.label}</span><b>{r.value}</b></div>
      ))}
    </div>
  );
}

function RequestPhotosStrip({ requestId }) {
  const [photos, setPhotos] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetchRequestPhotos(requestId).then((p) => { if (!cancelled) setPhotos(p); });
    return () => { cancelled = true; };
  }, [requestId]);
  if (!photos || photos.length === 0) return null;
  return (
    <div className="photo-strip">
      {photos.map((p) => (
        <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="photo-strip-thumb">
          <img src={p.url} alt="" />
        </a>
      ))}
    </div>
  );
}

function AppShell() {
  const [langCode, setLangCode] = useState("nl");
  const [role, setRole] = useState("customer");
  const [toast, setToast] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [catalogError, setCatalogError] = useState(null);
  const [becomeProOpen, setBecomeProOpen] = useState(false);
  const toastTimer = useRef(null);
  const { session, loading: authLoading, proProfile } = useAuth();

  useEffect(() => {
    fetchCatalog().then(setCatalog).catch((err) => setCatalogError(err.message));
  }, []);

  const langMeta = LANGS.find((l) => l.code === langCode);
  const t = STRINGS[langCode];
  const dir = langCode === "ar" ? "rtl" : "ltr";
  const fmt = (n) => Number(n).toLocaleString(langMeta.locale);
  const fmtDate = (ts) => new Date(ts).toLocaleDateString(langMeta.locale);
  const CATS = catalog?.CATS ?? [];
  const BASE_SERVICES = catalog?.BASE_SERVICES ?? [];
  const catName = (id) => catalog?.CAT_I18N[langCode]?.[id] ?? id;
  const serviceInfo = (id) => catalog?.SERVICE_I18N[langCode]?.[id] ?? { name: "", blurb: "" };
  const proBadgeLabel = (tier) => (tier === "top" ? t.topRated : tier === "elite" ? t.elitePro : null);
  const whenLabel = (whenPref) => ({ this_week: t.whenThisWeek, next_week: t.whenNextWeek, flexible: t.whenFlexible }[whenPref] ?? whenPref);

  const ctx = { t, dir, fmt, fmtDate, catName, serviceInfo, proBadgeLabel, langCode, CATS, BASE_SERVICES, whenLabel };

  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };

  let body;
  if (authLoading || (session && !catalog && !catalogError)) {
    body = <div className="pad"><div className="empty-block"><p>...</p></div></div>;
  } else if (catalogError) {
    body = <div className="pad"><div className="empty-block"><p>{catalogError}</p></div></div>;
  } else if (!session) {
    body = <AuthScreen />;
  } else if (role === "pro") {
    body = proProfile ? (
      <ProApp showToast={showToast} />
    ) : (
      <BecomeProPrompt onStart={() => setBecomeProOpen(true)} />
    );
  } else {
    body = <CustomerApp showToast={showToast} />;
  }

  return (
    <LangContext.Provider value={ctx}>
      <div className="stage" dir={dir}>
        <style>{CSS}</style>

        <div className="topbar">
          {session && (
            <div className="role-switch">
              <span className="role-switch-label">{t.previewingAs}</span>
              <div className="segmented">
                <button className={role === "customer" ? "seg-on" : ""} onClick={() => setRole("customer")}>{t.roleCustomer}</button>
                <button className={role === "pro" ? "seg-on" : ""} onClick={() => setRole("pro")}>{t.rolePro}</button>
              </div>
            </div>
          )}
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
            {body}
            {becomeProOpen && <BecomeProSheet onClose={() => setBecomeProOpen(false)} onDone={() => { setBecomeProOpen(false); setRole("pro"); }} />}
          </div>
          {toast && <div className="toast">{toast}</div>}
        </div>
      </div>
    </LangContext.Provider>
  );
}

function AuthScreen() {
  const { t } = useLang();
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      if (mode === "signin") {
        await signIn(email, password);
      } else {
        const { needsEmailConfirmation } = await signUp(email, password, fullName);
        if (needsEmailConfirmation) setNotice(t.authCheckEmail);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pad">
      <div className="hello"><div className="h1">{mode === "signin" ? t.authSignInTitle : t.authSignUpTitle}</div></div>
      <form onSubmit={submit}>
        {mode === "signup" && (
          <>
            <label className="field-label">{t.authFullNameLabel}</label>
            <div className="search" style={{ marginBottom: 14 }}>
              <User size={15} color="var(--ink-soft)" />
              <input required value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
          </>
        )}
        <label className="field-label">{t.authEmailLabel}</label>
        <div className="search" style={{ marginBottom: 14 }}>
          <Mail size={15} color="var(--ink-soft)" />
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <label className="field-label">{t.authPasswordLabel}</label>
        <div className="search" style={{ marginBottom: 18 }}>
          <Lock size={15} color="var(--ink-soft)" />
          <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <div className="fineprint" style={{ color: "#b3432f" }}>{error}</div>}
        {notice && <div className="fineprint">{notice}</div>}
        <button className="btn-primary" type="submit" disabled={busy}>
          {mode === "signin" ? t.authSignInBtn : t.authSignUpBtn}
        </button>
      </form>
      <button className="btn-secondary" style={{ marginTop: 10 }} onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); setNotice(""); }}>
        {mode === "signin" ? t.authSwitchToSignUp : t.authSwitchToSignIn}
      </button>
    </div>
  );
}

function BecomeProPrompt({ onStart }) {
  const { t } = useLang();
  return (
    <div className="pad">
      <div className="empty-block">
        <Briefcase size={26} color="var(--ink-soft)" />
        <p>{t.becomeProPrompt}</p>
        <button className="btn-primary" onClick={onStart}>{t.becomeProBtn}</button>
      </div>
    </div>
  );
}

function BecomeProSheet({ onClose, onDone }) {
  const { t } = useLang();
  const { becomePro } = useAuth();
  const [proType, setProType] = useState("flexi");
  const [businessName, setBusinessName] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [bio, setBio] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      await becomePro({ proType, businessName, vatNumber, bio });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet onClose={onClose}>
      <div className="sheet-title">{t.becomeProTitle}</div>

      <label className="field-label">{t.proTypeLabel}</label>
      <div className="segmented segmented-block">
        <button className={proType === "flexi" ? "seg-on" : ""} onClick={() => setProType("flexi")}>{t.proTypeFlexi}</button>
        <button className={proType === "business" ? "seg-on" : ""} onClick={() => setProType("business")}>{t.proTypeBusiness}</button>
      </div>

      {proType === "business" && (
        <>
          <label className="field-label">{t.businessNameLabel}</label>
          <div className="search" style={{ marginBottom: 14 }}>
            <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
          </div>
          <label className="field-label">{t.vatNumberLabel}</label>
          <div className="search" style={{ marginBottom: 14 }}>
            <input value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} />
          </div>
        </>
      )}

      <label className="field-label">{t.bioLabel}</label>
      <textarea className="textarea" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />

      {error && <div className="fineprint" style={{ color: "#b3432f" }}>{error}</div>}
      <button className="btn-primary" disabled={busy} onClick={submit}>{t.becomeProSubmit}</button>
    </Sheet>
  );
}

function EditProfileSheet({ onClose, onSaved }) {
  const { t } = useLang();
  const { profile, proProfile, updateProfile, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [city, setCity] = useState(profile?.city || "");
  const [bio, setBio] = useState(proProfile?.bio || "");
  const [businessName, setBusinessName] = useState(proProfile?.business_name || "");
  const [vatNumber, setVatNumber] = useState(proProfile?.vat_number || "");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef(null);

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setUploadingAvatar(true);
    try {
      const url = await uploadAvatar(profile.id, file);
      await updateProfile({ avatar_url: url });
      setAvatarUrl(url);
      if (onSaved) await onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      await updateProfile({ full_name: fullName, city });
      if (proProfile) {
        await updateProProfile(profile.id, {
          bio,
          business_name: proProfile.pro_type === "business" ? businessName : null,
          vat_number: proProfile.pro_type === "business" ? vatNumber : null,
        });
        await refreshProfile();
      }
      if (onSaved) await onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet onClose={onClose}>
      <div className="sheet-title">{t.editProfileTitle}</div>

      <div className="avatar-upload-row">
        <button type="button" className="avatar-upload" onClick={() => fileInputRef.current.click()} disabled={uploadingAvatar}>
          <Avatar url={avatarUrl} initials={fullName[0] || "?"} size="lg" />
        </button>
        <button type="button" className="btn-secondary" onClick={() => fileInputRef.current.click()} disabled={uploadingAvatar}>
          {t.uploadPhotoBtn}
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleAvatarChange} />
      </div>

      <label className="field-label">{t.authFullNameLabel}</label>
      <div className="search" style={{ marginBottom: 14 }}>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </div>

      <label className="field-label">{t.cityLabel}</label>
      <div className="search" style={{ marginBottom: 14 }}>
        <input value={city} onChange={(e) => setCity(e.target.value)} />
      </div>

      {proProfile && (
        <>
          {proProfile.pro_type === "business" && (
            <>
              <label className="field-label">{t.businessNameLabel}</label>
              <div className="search" style={{ marginBottom: 14 }}>
                <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
              </div>
              <label className="field-label">{t.vatNumberLabel}</label>
              <div className="search" style={{ marginBottom: 14 }}>
                <input value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} />
              </div>
            </>
          )}
          <label className="field-label">{t.bioLabel}</label>
          <textarea className="textarea" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />
        </>
      )}

      {error && <div className="fineprint" style={{ color: "#b3432f" }}>{error}</div>}
      <button className="btn-primary" disabled={busy} onClick={submit}>{t.saveChangesBtn}</button>
    </Sheet>
  );
}

function PortfolioItemSheet({ item, onClose, onChanged }) {
  const { t } = useLang();
  const [caption, setCaption] = useState(item.caption || "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    await updatePortfolioCaption(item.id, caption);
    await onChanged();
    setBusy(false);
    onClose();
  };

  const remove = async () => {
    setBusy(true);
    await deletePortfolioItem(item.id, item.storage_path);
    await onChanged();
    setBusy(false);
    onClose();
  };

  return (
    <Sheet onClose={onClose}>
      <img src={item.image_url} alt="" style={{ width: "100%", borderRadius: 12, marginBottom: 14 }} />
      <label className="field-label">{t.captionLabel}</label>
      <div className="search" style={{ marginBottom: 16 }}>
        <input value={caption} onChange={(e) => setCaption(e.target.value)} />
      </div>
      <button className="btn-primary" disabled={busy} onClick={save}>{t.saveChangesBtn}</button>
      <button className="btn-secondary" style={{ marginTop: 8 }} disabled={busy} onClick={remove}>{t.deletePhotoBtn}</button>
    </Sheet>
  );
}

function AddTestimonialSheet({ proId, onClose, onAdded }) {
  const { t } = useLang();
  const [clientName, setClientName] = useState("");
  const [quoteText, setQuoteText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!quoteText.trim()) return;
    setError("");
    setBusy(true);
    try {
      await addTestimonial({ proId, clientName, quoteText });
      await onAdded();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet onClose={onClose}>
      <div className="sheet-title">{t.addTestimonialBtn}</div>

      <label className="field-label">{t.clientNameLabel}</label>
      <div className="search" style={{ marginBottom: 14 }}>
        <input value={clientName} onChange={(e) => setClientName(e.target.value)} />
      </div>

      <label className="field-label">{t.testimonialTextLabel}</label>
      <textarea className="textarea" rows={3} value={quoteText} onChange={(e) => setQuoteText(e.target.value)} />

      {error && <div className="fineprint" style={{ color: "#b3432f" }}>{error}</div>}
      <button className="btn-primary" disabled={busy} onClick={submit}>{t.addTestimonialBtn}</button>
    </Sheet>
  );
}

function ProPublicProfileSheet({ proId, onClose }) {
  const { t, fmt, proBadgeLabel } = useLang();
  const [proInfo, setProInfo] = useState(null);
  const [portfolioItems, setPortfolioItems] = useState(null);
  const [reviews, setReviews] = useState(null);
  const [testimonials, setTestimonials] = useState(null);

  useEffect(() => {
    fetchPublicProInfo([proId]).then((m) => setProInfo(m[proId] || null));
    fetchPortfolioItems(proId).then(setPortfolioItems);
    fetchReviewsForPro(proId).then(setReviews);
    fetchTestimonials(proId).then(setTestimonials);
  }, [proId]);

  if (!proInfo) {
    return <Sheet onClose={onClose}><div className="empty-block"><p>...</p></div></Sheet>;
  }

  return (
    <Sheet onClose={onClose}>
      <div className="profile-head">
        <Avatar url={proInfo.avatarUrl} initials={proInfo.initials} size="lg" />
        <div>
          <div className="h1" style={{ fontSize: 19 }}>{proInfo.name}</div>
          <div className="quote-rating"><Stars value={proInfo.rating} size={12} /> {proInfo.rating} ({fmt(proInfo.reviews)}) · {trustScore(proInfo)} {t.trustScoreLabel}</div>
        </div>
      </div>
      <div className="chiprow" style={{ marginTop: 4 }}>
        {proBadgeLabel(proInfo.badgeTier) && <Badge tone="forest">{proBadgeLabel(proInfo.badgeTier)}</Badge>}
        {proInfo.isCertified && <Badge tone="sage">{t.certifiedBadge}</Badge>}
      </div>
      {proInfo.bio && <p className="sheet-blurb">{proInfo.bio}</p>}

      {portfolioItems && portfolioItems.length > 0 && (
        <>
          <div className="section-title">{t.portfolioTitle}</div>
          <div className="portfolio-grid">
            {portfolioItems.map((item) => (
              <div key={item.id} className="portfolio-thumb">
                <img src={item.image_url} alt={item.caption || ""} />
              </div>
            ))}
          </div>
        </>
      )}

      <div className="section-title">{t.proReviewsTitle}</div>
      {(!reviews || reviews.length === 0) && <div className="fineprint" style={{ justifyContent: "flex-start" }}>{t.noReviewsYet}</div>}
      {(reviews || []).map((r) => (
        <div key={r.id} className="quote-card"><Stars value={r.stars} size={12} /><p className="quote-msg">"{r.text}"</p></div>
      ))}

      {testimonials && testimonials.length > 0 && (
        <>
          <div className="section-title">{t.testimonialsTitle}</div>
          <div className="fineprint" style={{ marginBottom: 10, justifyContent: "flex-start" }}>{t.unverifiedTestimonialNote}</div>
          {testimonials.map((tst) => (
            <div key={tst.id} className="quote-card">
              {tst.client_name && <div className="quote-name">{tst.client_name}</div>}
              <p className="quote-msg">"{tst.quote_text}"</p>
            </div>
          ))}
        </>
      )}
    </Sheet>
  );
}

/* ------------------------------- CUSTOMER APP ------------------------------ */

function CustomerApp({ showToast }) {
  const { t } = useLang();
  const { user } = useAuth();
  const [tab, setTab] = useState("discover");
  const [activeService, setActiveService] = useState(null);
  const [quoteForm, setQuoteForm] = useState(null);
  const [openRequest, setOpenRequest] = useState(null);
  const [reviewFor, setReviewFor] = useState(null);
  const [requests, setRequests] = useState(null);
  const [conversations, setConversations] = useState(null);
  const [openConversation, setOpenConversation] = useState(null);

  const refresh = () => fetchCustomerRequests(user.id).then(setRequests);
  const refreshConversations = () => fetchConversations(user.id).then(setConversations);

  useEffect(() => {
    refresh();
    return subscribeToCustomerRequests(user.id, refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  useEffect(() => {
    if (!openRequest) return;
    return subscribeToRequestQuotes(openRequest, refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest]);

  useEffect(() => {
    refreshConversations();
    return subscribeToConversationsForUser(user.id, refreshConversations);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  if (!requests || !conversations) return <div className="pad"><div className="empty-block"><p>...</p></div></div>;

  const openRequestObj = requests.find((r) => r.id === openRequest);
  const reviewReq = requests.find((r) => r.id === reviewFor);

  const createRequest = async (service, { whenPref, details, detailsJson, budget, city, photos }) => {
    const created = await createServiceRequest({
      customerId: user.id,
      serviceId: service.id,
      categoryId: service.cat,
      details,
      detailsJson,
      whenPref,
      budget: budget === "" || budget == null ? null : Number(budget),
      city: city || null,
    });
    if (photos && photos.length) {
      for (const file of photos) {
        await uploadRequestPhoto(created.id, user.id, file);
      }
    }
    await refresh();
  };

  const acceptQuote = async (quoteId) => {
    await acceptQuoteApi(quoteId);
    await refresh();
    showToast(t.toastBooked);
  };

  const markComplete = async (requestId) => {
    await markCompleteApi(requestId);
    await refresh();
  };

  const submitReview = async (request, review) => {
    await submitReviewApi({ requestId: request.id, customerId: user.id, proId: request.bookedProId, stars: review.stars, text: review.text });
    await refresh();
    showToast(t.toastThanks);
  };

  return (
    <div className="view">
      <div className="content">
        {tab === "discover" && <Discover onOpenService={(s) => setActiveService(s)} />}
        {tab === "requests" && <RequestsList requests={requests} onOpen={(id) => setOpenRequest(id)} />}
        {tab === "messages" && <MessagesList conversations={conversations} onOpen={setOpenConversation} />}
        {tab === "profile" && <CustomerProfile requests={requests} />}
      </div>

      <BottomNav tab={tab} setTab={setTab} items={[
        { id: "discover", label: t.navDiscover, icon: Home },
        { id: "requests", label: t.navRequests, icon: ClipboardList, badge: requests.filter((r) => r.status === "quotes_ready").length },
        { id: "messages", label: t.navMessages, icon: MessageCircle, badge: conversations.reduce((sum, c) => sum + c.unreadCount, 0) },
        { id: "profile", label: t.navProfile, icon: User },
      ]} />

      {activeService && <ServiceSheet service={activeService} onClose={() => setActiveService(null)} onRequest={() => { setQuoteForm(activeService); setActiveService(null); }} />}
      {quoteForm && <QuoteFormSheet service={quoteForm} onClose={() => setQuoteForm(null)} onSubmit={(answers) => { createRequest(quoteForm, answers); setQuoteForm(null); setTab("requests"); }} />}
      {openRequestObj && <RequestDetailSheet request={openRequestObj} onClose={() => setOpenRequest(null)} onAccept={acceptQuote} onComplete={() => markComplete(openRequestObj.id)} onReview={() => { setOpenRequest(null); setReviewFor(openRequestObj.id); }} />}
      {reviewReq && <ReviewSheet onClose={() => setReviewFor(null)} onSubmit={(review) => { submitReview(reviewReq, review); setReviewFor(null); }} />}
      {openConversation && (
        <ConversationSheet
          conversationId={openConversation.id}
          userId={user.id}
          otherName={openConversation.otherName}
          onClose={() => { setOpenConversation(null); refreshConversations(); }}
        />
      )}
    </div>
  );
}

function Discover({ onOpenService }) {
  const { t, fmt, catName, serviceInfo, CATS, BASE_SERVICES } = useLang();
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
  const { t, fmt, serviceInfo, CATS } = useLang();
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
  const { t, serviceInfo, whenLabel } = useLang();
  const { profile } = useAuth();
  const info = serviceInfo(service.id);
  const questions = SERVICE_QUESTIONS[service.id];
  const [details, setDetails] = useState("");
  const [whenPref, setWhenPref] = useState("this_week");
  const [budget, setBudget] = useState("");
  const [city, setCity] = useState(profile?.city || "");
  const [fields, setFields] = useState({});
  const [photos, setPhotos] = useState([]);
  const photoInputRef = useRef(null);

  const setField = (key, value) => setFields((f) => ({ ...f, [key]: value }));

  const addPhotos = (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = "";
    if (picked.length === 0) return;
    setPhotos((p) => [...p, ...picked.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))]);
  };

  const removePhoto = (previewUrl) => {
    setPhotos((p) => p.filter((ph) => ph.previewUrl !== previewUrl));
    URL.revokeObjectURL(previewUrl);
  };

  return (
    <Sheet onClose={onClose}>
      <div className="sheet-title">{t.quoteFormTitle}</div>
      <div className="sheet-sub">{t.forService} {info.name}</div>

      <label className="field-label">{t.whenLabel}</label>
      <div className="chiprow">
        {WHEN_PREFS.map((w) => (
          <button key={w} className={"chip" + (whenPref === w ? " chip-on" : "")} onClick={() => setWhenPref(w)}>{whenLabel(w)}</button>
        ))}
      </div>

      {questions && (
        <>
          <label className="field-label">{t.jobDetailsTitle}</label>
          {questions.map((f) => (
            <div key={f.key} className="job-field">
              <div className="job-field-label">{t[f.label]}</div>
              {f.type === "number" && (
                <div className="search" style={{ marginBottom: 0 }}>
                  <input type="number" min="0" placeholder={f.placeholder} value={fields[f.key] ?? ""} onChange={(e) => setField(f.key, e.target.value)} />
                </div>
              )}
              {f.type === "boolean" && (
                <div className="chiprow">
                  <button type="button" className={"chip" + (fields[f.key] === true ? " chip-on" : "")} onClick={() => setField(f.key, true)}>{t.yesLabel}</button>
                  <button type="button" className={"chip" + (fields[f.key] === false ? " chip-on" : "")} onClick={() => setField(f.key, false)}>{t.noLabel}</button>
                </div>
              )}
              {f.type === "select" && (
                <div className="chiprow">
                  {f.options.map((o) => (
                    <button type="button" key={o.value} className={"chip" + (fields[f.key] === o.value ? " chip-on" : "")} onClick={() => setField(f.key, o.value)}>{t[o.label]}</button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      <label className="field-label">{t.detailsLabel}</label>
      <textarea className="textarea" rows={3} placeholder={t.detailsPlaceholder} value={details} onChange={(e) => setDetails(e.target.value)} />

      <label className="field-label">{t.jobPhotosLabel}</label>
      <div className="portfolio-grid">
        {photos.map((p) => (
          <div key={p.previewUrl} className="portfolio-thumb">
            <img src={p.previewUrl} alt="" />
            <button type="button" className="photo-remove-btn" onClick={() => removePhoto(p.previewUrl)}><X size={12} /></button>
          </div>
        ))}
        <button type="button" className="portfolio-thumb portfolio-add" onClick={() => photoInputRef.current.click()}>
          <Camera size={20} />
        </button>
        <input ref={photoInputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={addPhotos} />
      </div>

      <label className="field-label">{t.cityLabel}</label>
      <div className="search" style={{ marginBottom: 14 }}>
        <input value={city} onChange={(e) => setCity(e.target.value)} />
      </div>

      <label className="field-label">{t.budgetLabel}</label>
      <div className="search" style={{ marginBottom: 18 }}>
        <span style={{ color: "var(--ink-soft)", fontFamily: "var(--font-mono)" }}>\u20ac</span>
        <input placeholder={t.budgetPlaceholder} value={budget} onChange={(e) => setBudget(e.target.value)} />
      </div>

      <button className="btn-primary" onClick={() => onSubmit({ whenPref, details: details || "\u2014", detailsJson: fields, budget, city, photos: photos.map((p) => p.file) })}><Send size={15} /> {t.sendRequestBtn}</button>
      <div className="fineprint"><ShieldCheck size={12} /> {t.privacyNote}</div>
    </Sheet>
  );
}

function RequestsList({ requests, onOpen }) {
  const { t, fmtDate, serviceInfo, whenLabel } = useLang();
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
            <div className="ticket-sub">{whenLabel(r.answers.when)} \u00b7 {fmtDate(r.createdAt)}</div>
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
  const [label, tone] = map[status] || [status, "sage"];
  return <Badge tone={tone}>{label}</Badge>;
}

function RequestDetailSheet({ request, onClose, onAccept, onComplete, onReview }) {
  const { t, fmt, serviceInfo, proBadgeLabel, whenLabel } = useLang();
  const { user } = useAuth();
  const [showInvoice, setShowInvoice] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [openProId, setOpenProId] = useState(null);
  const info = serviceInfo(request.serviceId);
  const bookedQuote = request.quotes.find((q) => q.proId === request.bookedProId);

  return (
    <Sheet onClose={onClose}>
      <div className="sheet-title">{info.name}</div>
      <div className="sheet-sub">{whenLabel(request.answers.when)} \u00b7 "{request.answers.details}"</div>
      <JobDetailsSummary serviceId={request.serviceId} fields={request.answers.fields} />
      <RequestPhotosStrip requestId={request.id} />

      {request.status === "collecting" && (
        <div className="empty-block"><Clock size={22} color="var(--ink-soft)" /><p>{t.waitingMsg}</p></div>
      )}

      {request.status === "quotes_ready" && (
        <>
          <div className="section-title" style={{ marginTop: 6 }}>{t.quotesTitle} ({request.quotes.length})</div>
          {request.quotes.map((q) => {
            const pro = q.pro;
            return (
              <div key={q.id} className="quote-card">
                <div className="quote-top">
                  <button type="button" className="quote-top-link" onClick={() => setOpenProId(pro.id)}>
                    <Avatar url={pro.avatarUrl} initials={pro.initials} />
                    <div style={{ flex: 1 }}>
                      <div className="quote-name">{pro.name} {proBadgeLabel(pro.badgeTier) && <Badge tone="forest">{proBadgeLabel(pro.badgeTier)}</Badge>}</div>
                    <div className="quote-rating"><Stars value={pro.rating} size={11} /> {pro.rating} ({fmt(pro.reviews)}) · {trustScore(pro)} {t.trustScoreLabel}</div>
                  </div>
                  </button>
                  <div className="quote-price">\u20ac{fmt(q.price)}</div>
                </div>
                <button className="btn-secondary" onClick={() => onAccept(q.id)}>{t.acceptQuoteBtn}</button>
              </div>
            );
          })}
        </>
      )}

      {request.status === "booked" && bookedQuote && (() => {
        const pro = bookedQuote.pro;
        const fee = Math.round(bookedQuote.price * PLATFORM_COMMISSION_RATE * 100) / 100;
        const net = Math.round((bookedQuote.price - fee) * 100) / 100;
        return (
          <div className="quote-card quote-card-booked">
            <div className="quote-top">
              <button type="button" className="quote-top-link" onClick={() => setOpenProId(pro.id)}>
              <Avatar url={pro.avatarUrl} initials={pro.initials} />
              <div style={{ flex: 1 }}><div className="quote-name">{pro.name}</div><div className="quote-rating"><Stars value={pro.rating} size={11} /> {pro.rating} \u00b7 {trustScore(pro)} {t.trustScoreLabel}</div></div>
              </button>
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

      {bookedQuote && (
        <button className="btn-secondary" style={{ marginTop: 8 }} onClick={() => setShowReport(true)}>{t.reportIssueBtn}</button>
      )}

      {showInvoice && bookedQuote && <InvoiceSheet request={request} quote={bookedQuote} onClose={() => setShowInvoice(false)} />}
      {showReport && bookedQuote && (
        <ReportSheet
          reporterId={user.id}
          proId={bookedQuote.proId}
          requestId={request.id}
          onClose={() => setShowReport(false)}
        />
      )}
      {openProId && <ProPublicProfileSheet proId={openProId} onClose={() => setOpenProId(null)} />}
    </Sheet>
  );
}

function ReportSheet({ reporterId, proId, requestId, onClose }) {
  const { t } = useLang();
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [details, setDetails] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const reasonLabel = (r) => ({
    no_show: t.reportReasonNoShow,
    poor_quality: t.reportReasonPoorQuality,
    billing_issue: t.reportReasonBillingIssue,
    other: t.reportReasonOther,
  }[r]);

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      await submitReport({ reporterId, proId, requestId, reason, details });
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet onClose={onClose}>
      <div className="sheet-title">{t.reportIssueBtn}</div>
      {sent ? (
        <div className="empty-block"><Check size={22} color="var(--forest)" /><p>{t.reportSentMsg}</p></div>
      ) : (
        <>
          <label className="field-label">{t.reportReasonLabel}</label>
          <div className="chiprow">
            {REPORT_REASONS.map((r) => (
              <button key={r} className={"chip" + (reason === r ? " chip-on" : "")} onClick={() => setReason(r)}>{reasonLabel(r)}</button>
            ))}
          </div>

          <label className="field-label">{t.reportDetailsLabel}</label>
          <textarea className="textarea" rows={3} value={details} onChange={(e) => setDetails(e.target.value)} />

          {error && <div className="fineprint" style={{ color: "#b3432f" }}>{error}</div>}
          <button className="btn-primary" disabled={busy} onClick={submit}>{t.reportSubmitBtn}</button>
        </>
      )}
    </Sheet>
  );
}

function InvoiceSheet({ request, quote, onClose }) {
  const { t, fmt, serviceInfo } = useLang();
  const info = serviceInfo(request.serviceId);
  const pro = quote.pro;
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

function ReviewSheet({ onClose, onSubmit }) {
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
  const { user, profile, signOut } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const completed = requests.filter((r) => r.status === "completed" || r.status === "reviewed").length;
  const reviews = requests.filter((r) => r.review);
  const displayName = profile?.full_name || t.profileYou;
  return (
    <div className="pad">
      <div className="profile-head"><Avatar url={profile?.avatar_url} initials={displayName[0]} size="lg" /><div><div className="h1" style={{ fontSize: 19 }}>{displayName}</div><div className="ticket-sub">{user.email}</div></div></div>
      <div className="stat-row">
        <div className="stat"><div className="stat-num">{requests.length}</div><div className="stat-label">{t.requestsSent}</div></div>
        <div className="stat"><div className="stat-num">{completed}</div><div className="stat-label">{t.jobsCompleted}</div></div>
      </div>
      <div className="section-title">{t.yourReviews}</div>
      {reviews.length === 0 && <div className="empty-block"><p>{t.noReviewsYet}</p></div>}
      {reviews.map((r) => (
        <div key={r.id} className="quote-card"><div className="quote-name">{serviceInfo(r.serviceId).name}</div><Stars value={r.review.stars} size={12} /><p className="quote-msg">"{r.review.text}"</p></div>
      ))}
      <button className="btn-secondary" style={{ marginTop: 14 }} onClick={() => setEditOpen(true)}>{t.editProfileBtn}</button>
      <button className="btn-secondary" style={{ marginTop: 8 }} onClick={signOut}><LogOut size={13} /> {t.authSignOut}</button>
      {editOpen && <EditProfileSheet onClose={() => setEditOpen(false)} />}
    </div>
  );
}

function MessagesList({ conversations, onOpen }) {
  const { t, serviceInfo } = useLang();
  return (
    <div className="pad">
      <div className="h1" style={{ marginBottom: 14 }}>{t.messagesTitle}</div>
      {conversations.length === 0 && (
        <div className="empty-block"><MessageCircle size={26} color="var(--ink-soft)" /><p>{t.messagesEmpty}</p></div>
      )}
      {conversations.map((c) => (
        <button key={c.id} className="ticket" onClick={() => onOpen(c)}>
          <TicketTear />
          <div className="ticket-body">
            <div className="ticket-row">
              <div className="ticket-title">{c.otherName}</div>
              {c.unreadCount > 0 && <Badge tone="amber">{c.unreadCount}</Badge>}
            </div>
            <div className="ticket-sub">{c.serviceId ? serviceInfo(c.serviceId).name : ""}</div>
            {c.lastMessage && <p className="quote-msg" style={{ margin: "8px 0 0" }}>"{c.lastMessage.body}"</p>}
          </div>
        </button>
      ))}
    </div>
  );
}

function ConversationSheet({ conversationId, userId, otherName, onClose }) {
  const { t } = useLang();
  const [messages, setMessages] = useState(null);
  const [draft, setDraft] = useState("");

  const refresh = () => fetchMessages(conversationId).then(setMessages);

  useEffect(() => {
    refresh();
    markConversationRead(conversationId, userId);
    const unsubscribe = subscribeToMessages(conversationId, () => {
      refresh();
      markConversationRead(conversationId, userId);
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    await sendMessage({ conversationId, senderId: userId, body });
    await refresh();
  };

  return (
    <Sheet onClose={onClose}>
      <div className="sheet-title">{otherName}</div>
      <div className="chat-scroll">
        {(messages || []).map((m) => (
          <div key={m.id} className={"chat-bubble " + (m.senderId === userId ? "chat-bubble-me" : "chat-bubble-them")}>
            {m.body}
          </div>
        ))}
      </div>
      <div className="chat-input-row">
        <input
          placeholder={t.messagePlaceholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
        />
        <button onClick={send}><Send size={16} /></button>
      </div>
    </Sheet>
  );
}

/* ---------------------------------- PRO APP -------------------------------- */

function ProApp({ showToast }) {
  const { t, BASE_SERVICES } = useLang();
  const { user } = useAuth();
  const [tab, setTab] = useState("dashboard");
  const [quoteLead, setQuoteLead] = useState(null);
  const [leads, setLeads] = useState(null);
  const [jobs, setJobs] = useState(null);
  const [offeredServiceIds, setOfferedServiceIds] = useState(null);
  const [proInfo, setProInfo] = useState(null);
  const [conversations, setConversations] = useState(null);
  const [openConversation, setOpenConversation] = useState(null);

  const offeredCategoryIds = [...new Set((offeredServiceIds ?? []).map((id) => BASE_SERVICES.find((s) => s.id === id)?.cat).filter(Boolean))];
  const categoryKey = offeredCategoryIds.join(",");

  const refreshLeads = () => fetchProLeads(user.id).then(setLeads);
  const refreshJobs = () => fetchProJobs(user.id).then(setJobs);
  const refreshConversations = () => fetchConversations(user.id).then(setConversations);
  const refreshProInfo = () => fetchPublicProInfo([user.id]).then((m) => setProInfo(m[user.id]));

  useEffect(() => {
    fetchProServices(user.id).then(setOfferedServiceIds);
    fetchPublicProInfo([user.id]).then((m) => setProInfo(m[user.id]));
    refreshLeads();
    refreshJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  useEffect(() => subscribeToProQuoteUpdates(user.id, refreshJobs), [user.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    refreshLeads();
    return subscribeToProLeads(offeredCategoryIds, refreshLeads);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryKey]);

  useEffect(() => {
    refreshConversations();
    return subscribeToConversationsForUser(user.id, refreshConversations);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  if (!leads || !jobs || !proInfo || !offeredServiceIds || !conversations) {
    return <div className="pad"><div className="empty-block"><p>...</p></div></div>;
  }

  const earnedGross = [...jobs.booked, ...jobs.completed].reduce((sum, r) => {
    const q = r.quotes.find((qq) => qq.proId === user.id);
    return sum + (q ? q.price * (1 - PLATFORM_COMMISSION_RATE) : 0);
  }, 0);

  const sendQuote = async (lead, price, message) => {
    await sendQuoteApi({ requestId: lead.id, proId: user.id, price, message });
    setQuoteLead(null);
    await refreshLeads();
    await refreshJobs();
    showToast(t.toastQuoteSent);
  };

  return (
    <div className="view">
      <div className="content">
        {tab === "dashboard" && <ProDashboard leads={leads} onQuote={(l) => setQuoteLead(l)} proInfo={proInfo} />}
        {tab === "jobs" && <ProJobs sent={jobs.sent} booked={jobs.booked} completed={jobs.completed} proId={user.id} />}
        {tab === "messages" && <MessagesList conversations={conversations} onOpen={setOpenConversation} />}
        {tab === "profile" && (
          <ProProfile proInfo={proInfo} completedCount={jobs.completed.length} earnedGross={earnedGross} offeredServiceIds={offeredServiceIds} onServicesChange={setOfferedServiceIds} onProfileSaved={refreshProInfo} onPauseToggled={refreshLeads} />
        )}
      </div>

      <BottomNav tab={tab} setTab={setTab} items={[
        { id: "dashboard", label: t.navDashboard, icon: Briefcase, badge: leads.length },
        { id: "jobs", label: t.navMyJobs, icon: ClipboardList },
        { id: "messages", label: t.navMessages, icon: MessageCircle, badge: conversations.reduce((sum, c) => sum + c.unreadCount, 0) },
        { id: "profile", label: t.navProfile, icon: User },
      ]} />

      {quoteLead && <SendQuoteSheet lead={quoteLead} onClose={() => setQuoteLead(null)} onSubmit={(price, msg) => sendQuote(quoteLead, price, msg)} />}
      {openConversation && (
        <ConversationSheet
          conversationId={openConversation.id}
          userId={user.id}
          otherName={openConversation.otherName}
          onClose={() => { setOpenConversation(null); refreshConversations(); }}
        />
      )}
    </div>
  );
}

function ProDashboard({ leads, onQuote, proInfo }) {
  const { t, fmt, serviceInfo, whenLabel } = useLang();
  const { proProfile } = useAuth();
  return (
    <div className="pad">
      <div className="hello"><div><div className="eyebrow">{t.proWelcome}</div><div className="h1">{proInfo.name}</div></div><Avatar url={proInfo.avatarUrl} initials={proInfo.initials} /></div>

      <div className="stat-row">
        <div className="stat"><div className="stat-num"><Stars value={proInfo.rating} size={12} /></div><div className="stat-label">{proInfo.rating} {t.statScore}</div></div>
        <div className="stat"><div className="stat-num">{fmt(proInfo.reviews)}</div><div className="stat-label">{t.statReviewsLabel}</div></div>
        <div className="stat"><div className="stat-num">{trustScore(proInfo)}</div><div className="stat-label">{t.trustScoreLabel}</div></div>
      </div>

      {proProfile.paused && (
        <div className="empty-block" style={{ marginBottom: 16 }}>
          <ClipboardList size={22} color="var(--ink-soft)" />
          <p><b>{t.pausedBannerTitle}</b><br />{t.pausedBannerMsg}</p>
        </div>
      )}

      <div className="section-title">{t.newLeadsTitle}</div>
      {leads.length === 0 && <div className="empty-block"><TrendingUp size={22} color="var(--ink-soft)" /><p>{t.noLeadsMsg}</p></div>}
      {leads.map((r) => (
        <div key={r.id} className="ticket">
          <TicketTear />
          <div className="ticket-body">
            <div className="ticket-row"><div className="ticket-title">{serviceInfo(r.serviceId).name}</div><Badge tone="amber">{t.newBadge}</Badge></div>
            <div className="ticket-sub">{whenLabel(r.answers.when)} \u00b7 {r.answers.budget ? `\u20ac${r.answers.budget}` : t.budgetFlexible}{r.answers.city ? ` \u00b7 ${r.answers.city}` : ""}</div>
            <p className="quote-msg" style={{ margin: "8px 0" }}>"{r.answers.details}"</p>
            <JobDetailsSummary serviceId={r.serviceId} fields={r.answers.fields} />
            <RequestPhotosStrip requestId={r.id} />
            <div className="ticket-divider" />
            <button className="btn-secondary" onClick={() => onQuote(r)}>{t.sendQuoteBtn}</button>
          </div>
        </div>
      ))}
      {proProfile.pro_type === "flexi" && (
        <div className="fineprint" style={{ marginTop: 4 }}><BadgeCheck size={12} /> {t.flexiHiddenNote}</div>
      )}
    </div>
  );
}

function SendQuoteSheet({ lead, onClose, onSubmit }) {
  const { t, serviceInfo, BASE_SERVICES } = useLang();
  const service = BASE_SERVICES.find((s) => s.id === lead.serviceId);
  const [price, setPrice] = useState(service?.base || 65);
  const [msg, setMsg] = useState(t.defaultProMessage);
  return (
    <Sheet onClose={onClose}>
      <div className="sheet-title">{t.sendQuoteTitle}</div>
      <div className="sheet-sub">{serviceInfo(lead.serviceId).name}</div>
      <JobDetailsSummary serviceId={lead.serviceId} fields={lead.answers.fields} />
      <RequestPhotosStrip requestId={lead.id} />

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

function ProJobs({ sent, booked, completed, proId }) {
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
        const myQuote = r.quotes.find((q) => q.proId === proId);
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

function ProProfile({ proInfo, completedCount, earnedGross, offeredServiceIds, onServicesChange, onProfileSaved, onPauseToggled }) {
  const { t, fmt, catName, serviceInfo, proBadgeLabel, CATS, BASE_SERVICES } = useLang();
  const { user, proProfile, refreshProfile, signOut } = useAuth();
  const [selected, setSelected] = useState(offeredServiceIds);
  const [saving, setSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [portfolioItems, setPortfolioItems] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [editingPortfolioItem, setEditingPortfolioItem] = useState(null);
  const [testimonials, setTestimonials] = useState(null);
  const [addTestimonialOpen, setAddTestimonialOpen] = useState(false);
  const portfolioFileRef = useRef(null);
  const flexiPct = Math.min(100, Math.round((earnedGross / FLEXI_TAX_FREE_THRESHOLD) * 100));
  const isBoosted = proProfile.boosted_until && new Date(proProfile.boosted_until) > new Date();

  const refreshPortfolio = () => fetchPortfolioItems(user.id).then(setPortfolioItems);
  const refreshTestimonials = () => fetchTestimonials(user.id).then(setTestimonials);

  useEffect(() => {
    refreshPortfolio();
    refreshTestimonials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  const toggle = (id) => setSelected((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  const handlePortfolioUpload = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const { url, path } = await uploadPortfolioImage(user.id, file);
      await addPortfolioItem({ proId: user.id, imageUrl: url, storagePath: path });
      await refreshPortfolio();
    } finally {
      setUploadingPhoto(false);
    }
  };

  const removeTestimonial = async (id) => {
    await deleteTestimonial(id);
    await refreshTestimonials();
  };

  const saveServices = async () => {
    setSaving(true);
    await updateProServices(user.id, selected);
    onServicesChange(selected);
    setSaving(false);
  };

  const setProType = async (proType) => {
    await updateProProfile(user.id, { pro_type: proType });
    await refreshProfile();
  };

  const boost = async () => {
    await boostProfile(user.id);
    await refreshProfile();
  };

  const togglePaused = async () => {
    await updateProProfile(user.id, { paused: !proProfile.paused });
    await refreshProfile();
    if (onPauseToggled) await onPauseToggled();
  };

  return (
    <div className="pad">
      <div className="profile-head"><Avatar url={proInfo.avatarUrl} initials={proInfo.initials} size="lg" /><div><div className="h1" style={{ fontSize: 19 }}>{proInfo.name}</div><div className="quote-rating"><Stars value={proInfo.rating} size={12} /> {proInfo.rating} ({fmt(proInfo.reviews)})</div></div></div>
      {proProfile.bio && <p className="sheet-blurb">{proProfile.bio}</p>}
      <div className="stat-row">
        <div className="stat"><div className="stat-num">{completedCount}</div><div className="stat-label">{t.proJobsDone}</div></div>
        <div className="stat"><div className="stat-num">{proBadgeLabel(proInfo.badgeTier) || "\u2014"}</div><div className="stat-label">{t.proStatus}</div></div>
        <div className="stat"><div className="stat-num">{trustScore(proInfo)}</div><div className="stat-label">{t.trustScoreLabel}</div></div>
      </div>

      <button className="btn-secondary" style={{ marginBottom: 14 }} onClick={togglePaused}>
        {proProfile.paused ? t.resumeProfileBtn : t.pauseProfileBtn}
      </button>

      <div className="section-title">{t.proTypeLabel}</div>
      <div className="segmented segmented-block">
        <button className={proProfile.pro_type === "flexi" ? "seg-on" : ""} onClick={() => setProType("flexi")}>{t.proTypeFlexi}</button>
        <button className={proProfile.pro_type === "business" ? "seg-on" : ""} onClick={() => setProType("business")}>{t.proTypeBusiness}</button>
      </div>

      {proProfile.pro_type === "flexi" && (
        <div className="flexi-box">
          <div className="ticket-title" style={{ fontSize: 13.5, marginBottom: 8 }}>{t.flexiTrackerTitle}</div>
          <div className="flexi-bar"><div className="flexi-bar-fill" style={{ width: `${flexiPct}%` }} /></div>
          <div className="ticket-sub" style={{ marginTop: 6 }}>\u20ac{fmt(Math.round(earnedGross))} {t.flexiUsedOf} \u20ac{fmt(FLEXI_TAX_FREE_THRESHOLD)}</div>
          <div className="fineprint" style={{ marginTop: 8, justifyContent: "flex-start", textAlign: "start" }}>{t.flexiThresholdNote}</div>
        </div>
      )}

      <div className="section-title">{t.proServicesTitle}</div>
      {CATS.map((c) => {
        const services = BASE_SERVICES.filter((s) => s.cat === c.id);
        if (services.length === 0) return null;
        const locked = c.id === "specialist" && proProfile.pro_type === "flexi";
        return (
          <div key={c.id} style={{ marginBottom: 10 }}>
            <div className="ticket-sub" style={{ marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}><c.icon size={12} /> {catName(c.id)}</div>
            <div className="chiprow" style={{ paddingBottom: 4 }}>
              {services.map((s) => (
                <button key={s.id} className={"chip" + (selected.includes(s.id) && !locked ? " chip-on" : "") + (locked ? " chip-locked" : "")} disabled={locked} onClick={() => !locked && toggle(s.id)}>
                  {serviceInfo(s.id).name}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      <button className="btn-secondary" style={{ marginBottom: 14 }} disabled={saving} onClick={saveServices}>{t.saveServicesBtn}</button>

      <div className="section-title">{t.portfolioTitle}</div>
      <div className="portfolio-grid">
        {(portfolioItems || []).map((item) => (
          <button key={item.id} type="button" className="portfolio-thumb" onClick={() => setEditingPortfolioItem(item)}>
            <img src={item.image_url} alt={item.caption || ""} />
          </button>
        ))}
        <button type="button" className="portfolio-thumb portfolio-add" disabled={uploadingPhoto} onClick={() => portfolioFileRef.current.click()}>
          <Camera size={20} />
        </button>
        <input ref={portfolioFileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePortfolioUpload} />
      </div>
      {portfolioItems && portfolioItems.length === 0 && <div className="fineprint" style={{ justifyContent: "flex-start", marginBottom: 14 }}>{t.noPortfolioYet}</div>}

      <div className="section-title">{t.testimonialsTitle}</div>
      <div className="fineprint" style={{ marginBottom: 10, justifyContent: "flex-start" }}>{t.unverifiedTestimonialNote}</div>
      {testimonials && testimonials.length === 0 && <div className="empty-block" style={{ marginBottom: 14 }}><p>{t.noTestimonialsYet}</p></div>}
      {(testimonials || []).map((tst) => (
        <div key={tst.id} className="quote-card">
          {tst.client_name && <div className="quote-name">{tst.client_name}</div>}
          <p className="quote-msg">"{tst.quote_text}"</p>
          <button className="btn-secondary" onClick={() => removeTestimonial(tst.id)}>{t.deleteBtn}</button>
        </div>
      ))}
      <button className="btn-secondary" style={{ marginBottom: 14 }} onClick={() => setAddTestimonialOpen(true)}>{t.addTestimonialBtn}</button>

      <div className="section-title">{t.boostTitle}</div>
      <div className="quote-card">
        <p className="sheet-blurb" style={{ margin: "0 0 10px" }}>{t.boostDesc}</p>
        {isBoosted ? (
          <Badge tone="amber">{t.boostActive}</Badge>
        ) : (
          <button className="btn-primary" onClick={boost}>{t.boostBtn} \u20ac{BOOST_WEEKLY_PRICE}</button>
        )}
      </div>

      <div className="fineprint" style={{ marginTop: 14 }}><ThumbsUp size={12} /> {t.proFineprint}</div>
      <button className="btn-secondary" style={{ marginTop: 10 }} onClick={() => setEditOpen(true)}>{t.editProfileBtn}</button>
      <button className="btn-secondary" style={{ marginTop: 8 }} onClick={signOut}><LogOut size={13} /> {t.authSignOut}</button>
      {editOpen && <EditProfileSheet onClose={() => setEditOpen(false)} onSaved={onProfileSaved} />}
      {editingPortfolioItem && (
        <PortfolioItemSheet item={editingPortfolioItem} onClose={() => setEditingPortfolioItem(null)} onChanged={refreshPortfolio} />
      )}
      {addTestimonialOpen && (
        <AddTestimonialSheet proId={user.id} onClose={() => setAddTestimonialOpen(false)} onAdded={refreshTestimonials} />
      )}
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

.chat-scroll{ display:flex; flex-direction:column; gap:8px; max-height:50vh; overflow-y:auto; padding:4px 2px 14px; }
.chat-bubble{ max-width:78%; padding:9px 13px; border-radius:16px; font-size:13px; line-height:1.45; }
.chat-bubble-them{ align-self:flex-start; background:var(--surface); border:1px solid var(--line); color:var(--ink); border-bottom-left-radius:4px; }
.chat-bubble-me{ align-self:flex-end; background:var(--forest); color:#fff; border-bottom-right-radius:4px; }
.chat-input-row{ display:flex; gap:8px; align-items:center; }
.chat-input-row input{ flex:1; border:1px solid var(--line); border-radius:999px; padding:11px 15px; font-size:13px; font-family:var(--font-body); color:var(--ink); outline:none; }
.chat-input-row button{ width:38px; height:38px; border-radius:50%; background:var(--forest); color:#fff; border:none; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0; }

.avatar img{ width:100%; height:100%; border-radius:50%; object-fit:cover; }
.avatar-upload-row{ display:flex; align-items:center; gap:12px; margin-bottom:18px; }
.avatar-upload{ padding:0; border:none; background:none; border-radius:50%; cursor:pointer; flex-shrink:0; }

.portfolio-grid{ display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; margin-bottom:12px; }
.portfolio-thumb{ position:relative; width:100%; aspect-ratio:1; border-radius:10px; overflow:hidden; border:1px solid var(--line); background:var(--surface); padding:0; cursor:pointer; }
.portfolio-thumb img{ width:100%; height:100%; object-fit:cover; display:block; }
.portfolio-add{ display:flex; align-items:center; justify-content:center; color:var(--ink-soft); background:var(--sage-bg); border-style:dashed; }
.photo-remove-btn{ position:absolute; top:4px; right:4px; width:20px; height:20px; border-radius:50%; border:none; background:rgba(0,0,0,0.55); color:#fff; display:flex; align-items:center; justify-content:center; cursor:pointer; padding:0; }
.quote-top-link{ display:flex; align-items:center; gap:10px; flex:1; border:none; background:none; padding:0; margin:0; cursor:pointer; text-align:start; font-family:var(--font-body); min-width:0; }

.job-field{ margin-bottom:12px; }
.job-field-label{ font-size:12.5px; color:var(--ink-soft); margin-bottom:6px; }
.job-details-summary{ background:var(--sage-bg); border-radius:10px; padding:10px 12px; margin:8px 0; display:flex; flex-direction:column; gap:4px; }
.job-details-row{ display:flex; justify-content:space-between; gap:10px; font-size:13px; }
.job-details-row span{ color:var(--ink-soft); }
.photo-strip{ display:flex; gap:8px; overflow-x:auto; margin:8px 0; }
.photo-strip-thumb{ flex-shrink:0; width:64px; height:64px; border-radius:10px; overflow:hidden; border:1px solid var(--line); display:block; }
.photo-strip-thumb img{ width:100%; height:100%; object-fit:cover; display:block; }
`;
