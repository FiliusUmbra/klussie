// The four OAuth provider marks WelcomeScreen.jsx's own header used to say Lucide
// couldn't provide ("No brand logos: Lucide has no real Apple/Google/Microsoft/Facebook
// marks"). Kept out of that file, and out of lucide-react, on purpose:
// ICONOGRAPHY.md's own "Lucide, and only Lucide" is a rule about the app's *generic* icon
// set (chrome, chevrons, category glyphs) -- a third-party brand mark isn't a member of
// that set at all, any more than a company's own wordmark would be. Isolating the four
// here, as their own real components, keeps that boundary visible rather than importing
// a second icon package (which the rule does forbid) or hand-approximating a brand's mark
// from memory (which none of these do -- every path below was fetched from the provider's
// own official source and used verbatim, not redrawn).
//
// - Apple: the current monochrome Apple logo (single path). Apple's own guidance allows
//   only black or white for this mark, so it takes color from `color`/currentColor like
//   Lucide's own icons do, rather than carrying a fixed fill.
// - Google: Google's own "G" identity mark, sourced from Google's own FirebaseUI asset
//   (gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg) -- the specific four-color
//   version their own Sign In branding guidelines require, not the single-color
//   wordmark-style "G" a generic icon set offers instead.
// - Microsoft: the four-square mark from Microsoft's own 2012 identity refresh
//   (#F25022 / #7FBA00 / #00A4EF / #FFB900, unchanged since), the same colors their own
//   sign-in button guidance uses -- extracted from Microsoft's own published wordmark SVG;
//   no wordmark text carried over, since WelcomeScreen.jsx's own {t.continueWithMicrosoft}
//   already supplies that.
// - Facebook: the current (2019-on) mark -- a fixed #1977F3 circle with a white "f", not
//   recolorable the way Apple's is, matching Facebook's own brand guidance that this mark
//   keeps its own color rather than adapting to a host page.
//
// Every component takes the same `size` prop lucide-react's own icons do, so a call site
// swaps one for the other without changing shape.

export function AppleIcon({ size = 18, color = "currentColor", ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true" {...rest}>
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}

export function GoogleIcon({ size = 18, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 118 120" aria-hidden="true" {...rest}>
      <path fill="#4285F4" d="M117.6,61.3636364 C117.6,57.1090909 117.218182,53.0181818 116.509091,49.0909091 L60,49.0909091 L60,72.3 L92.2909091,72.3 C90.9,79.8 86.6727273,86.1545455 80.3181818,90.4090909 L80.3181818,105.463636 L99.7090909,105.463636 C111.054545,95.0181818 117.6,79.6363636 117.6,61.3636364 L117.6,61.3636364 Z" />
      <path fill="#34A853" d="M60,120 C76.2,120 89.7818182,114.627273 99.7090909,105.463636 L80.3181818,90.4090909 C74.9454545,94.0090909 68.0727273,96.1363636 60,96.1363636 C44.3727273,96.1363636 31.1454545,85.5818182 26.4272727,71.4 L6.38181818,71.4 L6.38181818,86.9454545 C16.2545455,106.554545 36.5454545,120 60,120 L60,120 Z" />
      <path fill="#FBBC05" d="M26.4272727,71.4 C25.2272727,67.8 24.5454545,63.9545455 24.5454545,60 C24.5454545,56.0454545 25.2272727,52.2 26.4272727,48.6 L26.4272727,33.0545455 L6.38181818,33.0545455 C2.31818182,41.1545455 0,50.3181818 0,60 C0,69.6818182 2.31818182,78.8454545 6.38181818,86.9454545 L26.4272727,71.4 L26.4272727,71.4 Z" />
      <path fill="#EA4335" d="M60,23.8636364 C68.8090909,23.8636364 76.7181818,26.8909091 82.9363636,32.8363636 L100.145455,15.6272727 C89.7545455,5.94545455 76.1727273,0 60,0 C36.5454545,0 16.2545455,13.4454545 6.38181818,33.0545455 L26.4272727,48.6 C31.1454545,34.4181818 44.3727273,23.8636364 60,23.8636364 L60,23.8636364 Z" />
    </svg>
  );
}

export function MicrosoftIcon({ size = 18, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden="true" {...rest}>
      <rect fill="#F25022" width="34.2" height="34.2" />
      <rect x="37.8" fill="#7FBA00" width="34.2" height="34.2" />
      <rect y="37.8" fill="#00A4EF" width="34.2" height="34.2" />
      <rect x="37.8" y="37.8" fill="#FFB900" width="34.2" height="34.2" />
    </svg>
  );
}

export function FacebookIcon({ size = 18, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14222 14222" aria-hidden="true" {...rest}>
      <path fill="#1977F3" d="M14222 7111c0,-3927 -3184,-7111 -7111,-7111 -3927,0 -7111,3184 -7111,7111 0,3549 2600,6491 6000,7025l0 -4969 -1806 0 0 -2056 1806 0 0 -1567c0,-1782 1062,-2767 2686,-2767 778,0 1592,139 1592,139l0 1750 -897 0c-883,0 -1159,548 -1159,1111l0 1334 1972 0 -315 2056 -1657 0 0 4969c3400,-533 6000,-3475 6000,-7025z" />
      <path fill="#FEFEFE" d="M9879 9167l315 -2056 -1972 0 0 -1334c0,-562 275,-1111 1159,-1111l897 0 0 -1750c0,0 -814,-139 -1592,-139 -1624,0 -2686,984 -2686,2767l0 1567 -1806 0 0 2056 1806 0 0 4969c362,57 733,86 1111,86 378,0 749,-30 1111,-86l0 -4969 1657 0z" />
    </svg>
  );
}
