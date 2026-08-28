(() => {
  const form = document.querySelector("#memorial-form");
  const assist = document.querySelector(".ai-assist");
  const button = document.querySelector("#ai-assist-button");
  const consent = document.querySelector("#ai-consent");
  const story = document.querySelector("#story");
  const status = document.querySelector("#ai-status");
  const preview = document.querySelector("#ai-preview");
  const previewText = document.querySelector("#ai-preview-text");
  const provenance = document.querySelector("#story-ai-assisted");
  if (!form || !assist || !button || !consent || !story || !status || !preview || !previewText || !provenance) return;

  const name = form.querySelector('[name="name"]');
  const birthDate = form.querySelector('[name="birthDate"]');
  const deathDate = form.querySelector('[name="deathDate"]');
  const writeToken = form.querySelector('[name="writeToken"]');
  const tone = document.querySelector("#ai-tone");
  const length = document.querySelector("#ai-length");
  const useDraft = document.querySelector("#ai-use-draft");
  const keepMine = document.querySelector("#ai-keep-mine");

  const setStatus = (message) => {
    status.textContent = message;
  };

  async function requestDraft() {
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    preview.hidden = true;
    setStatus(`Asking ${assist.dataset.provider} to shape your notes…`);
    try {
      const response = await fetch("/assist/story", {
        body: JSON.stringify({
          birthDate: birthDate?.value || "",
          deathDate: deathDate?.value || "",
          length: length?.value || "medium",
          name: name?.value || "",
          story: story.value,
          tone: tone?.value || "warm",
          writeToken: writeToken?.value || "",
        }),
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || typeof result.draft !== "string") {
        throw new Error(result.error || "The story assistant could not respond.");
      }
      previewText.textContent = result.draft;
      preview.hidden = false;
      setStatus("Draft ready. Nothing has been changed yet.");
      preview.scrollIntoView({ block: "nearest" });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The story assistant could not respond. Your notes are unchanged.");
    } finally {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  }

  button.addEventListener("click", () => {
    if (!name?.value.trim()) {
      setStatus("Add the person's name first.");
      name?.focus();
      return;
    }
    if (!story.value.trim()) {
      setStatus("Add a few memories or rough notes in the story box first.");
      story.focus();
      return;
    }
    consent.returnValue = "";
    if (typeof consent.showModal === "function") {
      consent.showModal();
    } else if (window.confirm("Send the name, dates, and story text to the configured AI provider? Photos and videos are never sent.")) {
      void requestDraft();
    }
  });

  consent.addEventListener("close", () => {
    if (consent.returnValue === "confirm") void requestDraft();
  });

  useDraft?.addEventListener("click", () => {
    story.value = previewText.textContent || story.value;
    provenance.value = "1";
    preview.hidden = true;
    setStatus("Draft added. Review and edit it before publishing.");
    story.focus();
  });

  keepMine?.addEventListener("click", () => {
    preview.hidden = true;
    setStatus("Suggestion discarded. Your story is unchanged.");
  });
})();
