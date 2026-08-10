// Epic 03 WP3/WP4. These cover the parts a browser check can't reach: the Browser pane
// blocks microphone access, so the successful listening path (bars reacting to a real
// level, transcript building) can only be verified against controlled props here.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VoiceCapture, PhotoCapture, UnfoldPanel, UnfoldItem, RecentWorkStrip, TextComposer } from "../domain.jsx";

const composerLabels = { placeholder: "Or type it out…", label: "Describe your job", submitLabel: "Send" };

describe("TextComposer", () => {
  it("gives the input a real accessible name rather than relying on the placeholder", () => {
    render(<TextComposer value="" onChange={() => {}} onSubmit={() => {}} {...composerLabels} />);
    // getByLabelText only passes if the label is genuinely associated with the input.
    const input = screen.getByLabelText("Describe your job");
    expect(input.placeholder).toBe("Or type it out…");
  });

  it("blocks submission on an empty or whitespace-only draft without raising an error", () => {
    const onSubmit = vi.fn();
    const { container, rerender } = render(
      <TextComposer value="" onChange={() => {}} onSubmit={onSubmit} {...composerLabels} />
    );
    expect(container.querySelector(".conv-textrow-send").disabled).toBe(true);

    rerender(<TextComposer value="   " onChange={() => {}} onSubmit={onSubmit} {...composerLabels} />);
    expect(container.querySelector(".conv-textrow-send").disabled).toBe(true);

    // Submitting anyway (Enter in the field) must still be a no-op, not an error state.
    container.querySelector("form").requestSubmit();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits a real draft, including via Enter rather than only the button", () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <TextComposer value="my sink leaks" onChange={() => {}} onSubmit={onSubmit} {...composerLabels} />
    );
    expect(container.querySelector(".conv-textrow-send").disabled).toBe(false);
    container.querySelector("form").requestSubmit();
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("reports each keystroke to its caller, which owns the draft", () => {
    const onChange = vi.fn();
    render(<TextComposer value="" onChange={onChange} onSubmit={() => {}} {...composerLabels} />);
    fireEvent.change(screen.getByLabelText("Describe your job"), { target: { value: "leak" } });
    expect(onChange).toHaveBeenCalledWith("leak");
  });
});

describe("RecentWorkStrip", () => {
  it("renders a thumbnail per portfolio item, captioned for screen readers", () => {
    const { container } = render(
      <RecentWorkStrip
        label="Recent work"
        items={[
          { id: "a", imageUrl: "https://example.test/a.jpg", caption: "Painted hallway" },
          { id: "b", imageUrl: "https://example.test/b.jpg", caption: null },
        ]}
      />
    );
    const imgs = [...container.querySelectorAll(".recent-work-thumb")];
    expect(imgs).toHaveLength(2);
    expect(imgs[0].getAttribute("alt")).toBe("Painted hallway");
    // A missing caption becomes empty alt, not a filename read aloud.
    expect(imgs[1].getAttribute("alt")).toBe("");
  });

  it("renders nothing when a professional has no portfolio yet", () => {
    const { container } = render(<RecentWorkStrip label="Recent work" items={[]} />);
    // No heading, no placeholder tiles — an empty strip would imply work that isn't there.
    expect(container.querySelector(".recent-work")).toBeNull();
    expect(container.textContent).toBe("");
  });
});

describe("UnfoldPanel / UnfoldItem", () => {
  it("renders items in the order given, so the sequence follows arrival order", () => {
    const { container } = render(
      <UnfoldPanel>
        <UnfoldItem><span>recap</span></UnfoldItem>
        <UnfoldItem><span>understanding</span></UnfoldItem>
      </UnfoldPanel>
    );
    const texts = [...container.querySelectorAll(".unfold-item")].map((el) => el.textContent);
    expect(texts).toEqual(["recap", "understanding"]);
  });

  it("is a labelled polite live region, so stages arriving later are announced", () => {
    const { container } = render(
      <UnfoldPanel label="Progress of your request">
        <UnfoldItem><span>recap</span></UnfoldItem>
      </UnfoldPanel>
    );
    const panel = container.querySelector(".unfold");
    // Without this the whole mechanic is silent for screen-reader users: they hear the
    // first item and nothing as the analysis and professional arrive.
    expect(panel.getAttribute("aria-live")).toBe("polite");
    expect(panel.getAttribute("aria-label")).toBe("Progress of your request");
  });

  it("staggers only when a caller asks for it, so a late arrival is not held back", () => {
    const { container } = render(
      <UnfoldPanel>
        <UnfoldItem><span>first</span></UnfoldItem>
        <UnfoldItem delayIndex={1}><span>second</span></UnfoldItem>
      </UnfoldPanel>
    );
    const [a, b] = [...container.querySelectorAll(".unfold-item")];
    // Default is no delay: an item that arrives on its own appears immediately rather
    // than waiting on a position it never had.
    expect(a.style.animationDelay).toBe("0ms");
    expect(b.style.animationDelay).toBe("90ms");
  });
});

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

  it("announces the tag going from analysing to a real reading", () => {
    const { container } = render(<PhotoCapture previewUrl="blob:fake" analyzing tag={null} {...photoLabels} />);
    const live = container.querySelector("[aria-live]");
    expect(live).not.toBeNull();
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.textContent).toContain("Taking a look...");
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
