// A professional as a customer sees them: trust signals, portfolio, real reviews, and
// self-reported testimonials — in that order, so verified evidence is read before
// unverified. Opened from a quote or a booked job, never from a directory, because
// klussie doesn't ask customers to compare ten providers by hand.
import { useState, useEffect } from "react";
import { useLang } from "../lib/lang";
import { Avatar, Badge, Rating, QuoteCard, TrustBadge, Drawer } from "../design-system";
import { fetchPublicProInfo, fetchReviewsForPro, trustScore } from "../lib/pros";
import { fetchPortfolioItems } from "../lib/portfolio";
import { fetchTestimonials } from "../lib/testimonials";
import { LoadingScreen } from "../ui/Loading.jsx";

export function ProPublicProfileSheet({ proId, onClose }) {
  const { t, fmt, proBadgeLabel } = useLang();
  const [proInfo, setProInfo] = useState(null);
  const [portfolioItems, setPortfolioItems] = useState(null);
  const [reviews, setReviews] = useState(null);
  const [testimonials, setTestimonials] = useState(null);
  // Found by code audit: fetchPublicProInfo() throws on a real Postgres error, and the
  // whole sheet's render gates on proInfo below -- with no catch here, a real failure
  // left proInfo null forever, so a customer tapping a pro's name/avatar
  // (RequestDetailSheet.jsx, MyHomePanel.jsx's trusted-pros list) saw a bare, hand-rolled
  // "..." placeholder -- not even LoadingScreen, a near-duplicate of it missing the real
  // one's own .pad wrapper -- stuck forever, no error, no retry. The other three fetches
  // (portfolio/reviews/testimonials) also throw with no catch, but don't gate anything:
  // every one of their sections already degrades to "nothing to show" when its state is
  // still null, matching Profile.jsx's own identical portfolio/testimonials fix.
  const [proInfoLoadError, setProInfoLoadError] = useState(false);

  const loadProInfo = () =>
    fetchPublicProInfo([proId])
      .then((m) => { setProInfo(m[proId] || null); setProInfoLoadError(false); })
      .catch(() => setProInfoLoadError(true));

  useEffect(() => {
    loadProInfo();
    fetchPortfolioItems(proId).then(setPortfolioItems).catch(() => setPortfolioItems([]));
    fetchReviewsForPro(proId).then(setReviews).catch(() => setReviews([]));
    fetchTestimonials(proId).then(setTestimonials).catch(() => setTestimonials([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proId]);

  if (proInfo === null && proInfoLoadError) {
    return (
      <Drawer onClose={onClose} closeLabel={t.closeBtn}>
        <div className="empty-block">
          <p>{t.catalogLoadFailed}</p>
          <button type="button" className="btn-secondary" onClick={loadProInfo}>{t.retryBtn}</button>
        </div>
      </Drawer>
    );
  }

  if (!proInfo) {
    return <Drawer onClose={onClose} closeLabel={t.closeBtn}><LoadingScreen /></Drawer>;
  }

  return (
    <Drawer onClose={onClose} closeLabel={t.closeBtn}>
      <div className="profile-head">
        <Avatar url={proInfo.avatarUrl} initials={proInfo.initials} size="lg" />
        <div>
          <div className="h1" style={{ fontSize: 19 }}>{proInfo.name || t.proFallbackName}</div>
          <TrustBadge rating={proInfo.rating} reviewCount={proInfo.reviews} score={trustScore(proInfo)} scoreLabel={t.trustScoreLabel} fmt={fmt} />
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
        <QuoteCard key={r.id}><Rating value={r.stars} size={12} /><p className="quote-msg">"{r.text}"</p></QuoteCard>
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
    </Drawer>
  );
}
