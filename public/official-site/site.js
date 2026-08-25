(function () {
  const header = document.querySelector("[data-header]");
  const navToggle = document.querySelector("[data-nav-toggle]");
  const nav = document.querySelector("[data-nav]");
  const heroVideo = document.querySelector("[data-hero-video]");
  const audioToggle = document.querySelector("[data-audio-toggle]");
  const audioLabel = document.querySelector("[data-audio-label]");

  const closeNavigation = () => {
    if (!header || !navToggle) return;
    header.classList.remove("nav-open");
    navToggle.setAttribute("aria-expanded", "false");
    navToggle.setAttribute("aria-label", "打开导航");
  };

  if (navToggle && header) {
    navToggle.addEventListener("click", () => {
      const isOpen = header.classList.toggle("nav-open");
      navToggle.setAttribute("aria-expanded", String(isOpen));
      navToggle.setAttribute("aria-label", isOpen ? "关闭导航" : "打开导航");
    });
  }

  if (nav) {
    nav.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeNavigation));
  }

  const updateHeader = () => header?.classList.toggle("is-scrolled", window.scrollY > 18);
  updateHeader();
  window.addEventListener("scroll", updateHeader, { passive: true });

  const updateAudioState = () => {
    if (!heroVideo || !audioToggle || !audioLabel) return;
    const isMuted = heroVideo.muted || heroVideo.volume === 0;
    audioToggle.setAttribute("aria-pressed", String(!isMuted));
    audioLabel.textContent = isMuted ? "开启声音" : "关闭声音";
  };

  if (heroVideo && audioToggle) {
    updateAudioState();
    audioToggle.addEventListener("click", async () => {
      heroVideo.muted = !heroVideo.muted;
      try {
        await heroVideo.play();
      } catch {
        // The still-image poster remains useful when a browser blocks playback.
      }
      updateAudioState();
    });
    heroVideo.addEventListener("volumechange", updateAudioState);
  }

  const revealItems = document.querySelectorAll("[data-reveal]");
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    revealItems.forEach((item) => observer.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add("is-visible"));
  }
})();
