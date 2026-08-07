// Epic 03 WP3/WP4. These cover the parts a browser check can't reach: the Browser pane
// blocks microphone access, so the successful listening path (bars reacting to a real
// level, transcript building) can only be verified against controlled props here.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { VoiceCapture, PhotoCapture } from "../domain.jsx";

const voiceLabels = {
  listeningLabel: "Listening",
  doneLabel: "Got it.",
  stopLabel: "Done",
};

function barScales(container) {
  return [...container.querySelectorAll(".voice-bar")].map((bar) => {
    const match = /scaleY\(([\d.]+)\)/.exec(bar.style.transform);
    return match ? Number(match[1]) : null;
  });
}

describe("VoiceCapture", () => {
  it("scales the waveform from the measured level, so louder input means taller bars", () => {
    const quiet = render(<VoiceCapture state="listening" level={0.1} transcript="" {...voiceLabels} />);
    const quietScales = barScales(quiet.container);
    quiet.unmount();

    const loud = render(<VoiceCapture state="listening" level={0.9} transcript="" {...voiceLabels} />);
    const loudScales = barScales(loud.container);

    expect(loudScales).toHaveLength(quietScales.length);
    // Every bar grows with the level — none is running on its own animation.
    loudScales.forEach((scale, i) => expect(scale).toBeGreaterThan(quietScales[i]));
  });

  it("holds the bars still when metering is unavailable rather than faking motion", () => {
    const { container } = render(
      <VoiceCapture state="listening" level={0.9} meterAvailable={false} transcript="" {...voiceLabels} />
    );
    // Same flat value at a high level: an honest "no signal", not a decorative pulse.
    expect(new Set(barScales(container))).toEqual(new Set([0.15]));
  });

  it("announces the transcript politely as it builds", () => {
    render(<VoiceCapture state="listening" level={0} transcript="my sink is leaking" {...voiceLabels} />);
    const transcript = screen.getByText("my sink is leaking");
    expect(transcript.getAttribute("aria-live")).toBe("polite");
  });

  it("drops the waveform and the stop control once listening has ended", () => {
    const { container } = render(<VoiceCapture state="done" level={0} transcript="all done" {...voiceLabels} />);
    expect(container.querySelector(".voice-wave")).toBeNull();
    expect(container.querySelector(".voice-stop")).toBeNull();
    expect(screen.getByText("Got it.")).toBeTruthy();
  });

  it("calls onStop when the stop control is used", () => {
    const onStop = vi.fn();
    const { container } = render(
      <VoiceCapture state="listening" level={0} transcript="" onStop={onStop} {...voiceLabels} />
    );
    container.querySelector(".voice-stop").click();
    expect(onStop).toHaveBeenCalledOnce();
  });
});

const photoLabels = {
  analyzingLabel: "Taking a look...",
  confirmLabel: "That's enough",
  retakeLabel: "Different photo",
  alt: "Photo of your job",
};

describe("PhotoCapture", () => {
  it("renders the confidence tag inside the photo frame, not in a separate panel", () => {
    const { container } = render(
      <PhotoCapture previewUrl="blob:fake" analyzing={false} tag="Bosch · 94%" {...photoLabels} />
    );
    const frame = container.querySelector(".photo-capture-frame");
    const tag = container.querySelector(".photo-capture-tag");
    // The tag being a descendant of the frame is what keeps proof and evidence together.
    expect(frame.contains(tag)).toBe(true);
    expect(tag.textContent).toBe("Bosch · 94%");
  });

  it("blocks confirmation while the photo is still being analyzed", () => {
    const { container } = render(<PhotoCapture previewUrl="blob:fake" analyzing tag={null} {...photoLabels} />);
    expect(container.querySelector(".photo-capture-confirm").disabled).toBe(true);
    expect(screen.getByText("Taking a look...")).toBeTruthy();
  });

  it("shows no tag at all when analysis returned nothing usable", () => {
    const { container } = render(
      <PhotoCapture previewUrl="blob:fake" analyzing={false} tag={null} {...photoLabels} />
    );
    // No tag beats an invented one — the same rule the trust strip follows (ADR-0011).
    expect(container.querySelector(".photo-capture-tag")).toBeNull();
  });

  it("omits the image until a preview URL exists, so a revoked blob never renders", () => {
    const { container } = render(
      <PhotoCapture previewUrl={null} analyzing tag={null} {...photoLabels} />
    );
    expect(container.querySelector(".photo-capture-img")).toBeNull();
  });
});
