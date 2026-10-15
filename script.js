/**
 * Pure Cinematic Scroll-Driven Canvas Animation Engine
 * with Screen 1 & Screen 2 UI Choreography
 */

(function () {
  'use strict';

  const TOTAL_FRAMES = 800;
  const FRAME_DIRECTORY = '/IOT_club frames';
  const LERP_FACTOR = 0.15; // Smooth Apple-grade scroll inertia
  const TIMELINE_MAX_FRAME = 755; // Active timeline maximum frame to eliminate dead zones

  // Keyframe Milestones
  const SCREEN_ONE_MAX_FRAME = 45;
  const SCREEN_TWO_FADE_IN_START = 120;
  const SCREEN_TWO_PEAK_START = 180;
  const SCREEN_TWO_PEAK_END = 265;
  const SCREEN_TWO_FADE_OUT_END = 330;

  const SCREEN_THREE_FADE_IN_START = 370;
  const SCREEN_THREE_PEAK_START = 430;
  const SCREEN_THREE_PEAK_END = 490;
  const SCREEN_THREE_FADE_OUT_END = 560;

  const SCREEN_FOUR_FADE_IN_START = 680;
  const SCREEN_FOUR_PEAK_START = 745;

  // DOM Elements
  const canvas = document.getElementById('canvas-renderer');
  const ctx = canvas.getContext('2d');
  const progressBar = document.getElementById('scroll-progress-line');
  const screenOneOverlay = document.getElementById('screen-one-overlay');
  const screenTwoOverlay = document.getElementById('screen-two-overlay');
  const screenThreeOverlay = document.getElementById('screen-three-overlay');
  const screenFourOverlay = document.getElementById('screen-four-overlay');
  const screenFourScrollWrapper = document.getElementById('screen4-scroll-wrapper');
  const navLinkHome = document.getElementById('nav-link-home');
  const navLinkAbout = document.getElementById('nav-link-about');
  const navLinkAchievements = document.getElementById('nav-link-achievements');
  const navLinkMembers = document.getElementById('nav-link-members');
  const navLinkContact = document.getElementById('nav-link-contact');

  // Animation State
  const framesCache = new Array(TOTAL_FRAMES);
  const requestedSet = new Set();
  let lastGoodImage = null;
  let targetFrame = 0;
  let currentFrame = 0;
  let lastDrawnIndex = -1;
  let dpr = 1;

  // Frame URL Resolver with Cache-Buster
  const FRAME_VERSION = 'v=20261015_07';
  function getFrameUrl(index) {
    const frameNumber = index + 1;
    const pad = String(frameNumber).padStart(5, '0');
    return `${FRAME_DIRECTORY}/${pad}.jpg?${FRAME_VERSION}`;
  }

  // --- 0. Attractive IoT Intro Preloader Controller ---
  function initPreloader() {
    const preloader = document.getElementById('app-preloader');
    if (!preloader) return;

    const progBar = document.getElementById('preloader-progress-bar');
    const percentNum = document.getElementById('preloader-percent-num');
    const statusText = document.getElementById('preloader-status-text');

    let currentPercent = 0;
    let targetPercent = 18;
    let isComplete = false;
    const startTime = Date.now();
    const MIN_DISPLAY_TIME = 1300; // ms for a smooth, premium visual experience

    const statusMessages = [
      { at: 0, text: "Initializing IoT Core..." },
      { at: 35, text: "Loading 3D Visual Walkthrough..." },
      { at: 68, text: "Calibrating Interactive Lab..." },
      { at: 92, text: "Welcome to JSPM's JSCOE IoT Club!" }
    ];

    function updatePreloaderUI(val) {
      if (progBar) progBar.style.width = `${val}%`;
      if (percentNum) percentNum.textContent = `${Math.round(val)}%`;

      if (statusText) {
        for (let i = statusMessages.length - 1; i >= 0; i--) {
          if (val >= statusMessages[i].at) {
            statusText.textContent = statusMessages[i].text;
            break;
          }
        }
      }
    }

    window.notifyPreloaderProgress = function (percent) {
      if (percent > targetPercent) {
        targetPercent = Math.min(100, percent);
      }
    };

    const interval = setInterval(() => {
      // Smooth interpolation towards target
      if (currentPercent < targetPercent) {
        currentPercent += (targetPercent - currentPercent) * 0.16 + 0.6;
        if (currentPercent > targetPercent) currentPercent = targetPercent;
      }

      updatePreloaderUI(currentPercent);

      const elapsed = Date.now() - startTime;
      const firstFrameReady = framesCache[0] && framesCache[0].complete && framesCache[0].naturalWidth > 0;

      if (firstFrameReady && elapsed >= MIN_DISPLAY_TIME && !isComplete) {
        targetPercent = 100;
        if (currentPercent >= 99) {
          isComplete = true;
          clearInterval(interval);
          updatePreloaderUI(100);

          setTimeout(() => {
            preloader.classList.add('is-loaded');
            setTimeout(() => {
              preloader.style.display = 'none';
            }, 650);
          }, 180);
        }
      } else if (elapsed > 3200 && !isComplete) {
        // Fallback safety timeout
        isComplete = true;
        clearInterval(interval);
        updatePreloaderUI(100);
        preloader.classList.add('is-loaded');
        setTimeout(() => {
          preloader.style.display = 'none';
        }, 650);
      }
    }, 25);
  }

  // --- 1. Canvas Resizer (Retina High-DPI) ---
  function resizeCanvas() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render(true);
  }

  // --- 2. object-fit: cover Drawing Routine ---
  function drawCover(img) {
    if (!img || !img.complete || img.naturalWidth === 0) return;

    const cw = canvas.clientWidth || window.innerWidth;
    const ch = canvas.clientHeight || window.innerHeight;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;

    const canvasRatio = cw / ch;
    const imgRatio = iw / ih;

    let rw, rh, ox, oy;

    if (canvasRatio > imgRatio) {
      rw = cw;
      rh = cw / imgRatio;
      ox = 0;
      oy = (ch - rh) / 2;
    } else {
      rh = ch;
      rw = ch * imgRatio;
      ox = (cw - rw) / 2;
      oy = 0;
    }

    ctx.drawImage(img, ox, oy, rw, rh);
  }

  // --- 3. Request Frame (Priority & Background) ---
  function requestFrame(index, priority = false) {
    if (index < 0 || index >= TOTAL_FRAMES) return;
    if (framesCache[index] || requestedSet.has(index)) return;

    requestedSet.add(index);
    const img = new Image();
    img.src = getFrameUrl(index);

    img.onload = () => {
      framesCache[index] = img;
      requestedSet.delete(index);

      if (window.notifyPreloaderProgress && index <= 5) {
        const loadedCount = [0, 1, 2, 3, 4].filter(i => framesCache[i] && framesCache[i].complete).length;
        window.notifyPreloaderProgress(25 + loadedCount * 15);
      }

      // If near current scroll position, immediately redraw
      if (Math.abs(Math.round(currentFrame) - index) <= 1) {
        render(true);
      }
    };

    img.onerror = () => {
      requestedSet.delete(index);
    };
  }

  // Prioritize frames immediately around current viewport
  function prioritizeAround(center) {
    const rounded = Math.round(center);
    for (let i = 0; i <= 30; i++) {
      requestFrame(rounded + i, true);
      requestFrame(rounded - i, true);
    }
  }

  // --- 4. Bidirectional Nearest Loaded Frame Finder ---
  function getClosestLoadedImage(targetIdx) {
    const clamped = Math.max(0, Math.min(TOTAL_FRAMES - 1, Math.round(targetIdx)));

    if (framesCache[clamped] && framesCache[clamped].complete && framesCache[clamped].naturalWidth > 0) {
      return framesCache[clamped];
    }

    let dist = 1;
    while (clamped - dist >= 0 || clamped + dist < TOTAL_FRAMES) {
      const prev = clamped - dist;
      if (prev >= 0 && framesCache[prev] && framesCache[prev].complete && framesCache[prev].naturalWidth > 0) {
        return framesCache[prev];
      }
      const next = clamped + dist;
      if (next < TOTAL_FRAMES && framesCache[next] && framesCache[next].complete && framesCache[next].naturalWidth > 0) {
        return framesCache[next];
      }
      dist++;
    }

    return null;
  }

  // --- 5. Render Routine with lastGoodImage Protection ---
  function render(force = false) {
    const rounded = Math.round(currentFrame);
    if (!force && rounded === lastDrawnIndex) return;

    let img = getClosestLoadedImage(rounded);
    if (!img) {
      img = lastGoodImage;
    }

    if (img && img.complete && img.naturalWidth > 0) {
      drawCover(img);
      lastGoodImage = img;
      lastDrawnIndex = rounded;
    }
  }

  // --- 6. Scroll Listener ---
  function updateScroll() {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    if (maxScroll <= 0) return;

    const scrollTop = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
    const progress = Math.max(0, Math.min(1, scrollTop / maxScroll));

    targetFrame = progress * TIMELINE_MAX_FRAME;

    prioritizeAround(targetFrame);

    if (progressBar) {
      progressBar.style.width = `${(progress * 100).toFixed(1)}%`;
    }
  }

  // --- 7. RAF Physics Loop & Multi-Screen UI Choreography ---
  function loop() {
    const delta = targetFrame - currentFrame;
    if (Math.abs(delta) > 0.005) {
      currentFrame += delta * LERP_FACTOR;
      render();

      updateOverlays(currentFrame);
    }

    requestAnimationFrame(loop);
  }

  function updateOverlays(frame) {
    // 1. Screen One Overlay (Frames 0 -> 40)
    if (screenOneOverlay) {
      if (frame <= SCREEN_ONE_MAX_FRAME) {
        const fadeRatio = Math.max(0, Math.min(1, frame / 20));
        const opacity = (1 - fadeRatio).toFixed(3);
        const translateY = (fadeRatio * -40).toFixed(1);

        screenOneOverlay.style.opacity = opacity;
        screenOneOverlay.style.transform = `translateY(${translateY}px)`;
        const isOneActive = fadeRatio < 0.85;
        screenOneOverlay.style.pointerEvents = isOneActive ? 'auto' : 'none';
        screenOneOverlay.style.visibility = isOneActive ? 'visible' : 'hidden';
        screenOneOverlay.classList.toggle('active', isOneActive);
      } else {
        screenOneOverlay.style.opacity = '0';
        screenOneOverlay.style.pointerEvents = 'none';
        screenOneOverlay.style.visibility = 'hidden';
        screenOneOverlay.classList.remove('active');
      }
    }

    // 2. Screen Two Overlay (Frames 120 -> 330, peak at 180-265)
    if (screenTwoOverlay) {
      let opacity = 0;
      let translateY = 20;

      if (frame >= SCREEN_TWO_FADE_IN_START && frame <= SCREEN_TWO_FADE_OUT_END) {
        if (frame < SCREEN_TWO_PEAK_START) {
          // Fading in
          const t = (frame - SCREEN_TWO_FADE_IN_START) / (SCREEN_TWO_PEAK_START - SCREEN_TWO_FADE_IN_START);
          opacity = Math.max(0, Math.min(1, t));
          translateY = (1 - opacity) * 30;
        } else if (frame <= SCREEN_TWO_PEAK_END) {
          // Fully active
          opacity = 1;
          translateY = 0;
        } else {
          // Fading out
          const t = (frame - SCREEN_TWO_PEAK_END) / (SCREEN_TWO_FADE_OUT_END - SCREEN_TWO_PEAK_END);
          opacity = Math.max(0, Math.min(1, 1 - t));
          translateY = -((1 - opacity) * 30);
        }

        screenTwoOverlay.style.opacity = opacity.toFixed(3);
        screenTwoOverlay.style.transform = `translateY(${translateY.toFixed(1)}px)`;
        const isTwoActive = opacity > 0.2;
        screenTwoOverlay.style.pointerEvents = isTwoActive ? 'auto' : 'none';
        screenTwoOverlay.style.visibility = isTwoActive ? 'visible' : 'hidden';
        screenTwoOverlay.classList.toggle('active', isTwoActive);
      } else {
        screenTwoOverlay.style.opacity = '0';
        screenTwoOverlay.style.pointerEvents = 'none';
        screenTwoOverlay.style.visibility = 'hidden';
        screenTwoOverlay.classList.remove('active');
      }
    }

    // 3. Screen Three Overlay (Frames 370 -> 560, peak at 430-490)
    if (screenThreeOverlay) {
      let opacity = 0;
      let translateY = 20;

      if (frame >= SCREEN_THREE_FADE_IN_START && frame <= SCREEN_THREE_FADE_OUT_END) {
        if (frame < SCREEN_THREE_PEAK_START) {
          const t = (frame - SCREEN_THREE_FADE_IN_START) / (SCREEN_THREE_PEAK_START - SCREEN_THREE_FADE_IN_START);
          opacity = Math.max(0, Math.min(1, t));
          translateY = (1 - opacity) * 30;
        } else if (frame <= SCREEN_THREE_PEAK_END) {
          opacity = 1;
          translateY = 0;
        } else {
          const t = (frame - SCREEN_THREE_PEAK_END) / (SCREEN_THREE_FADE_OUT_END - SCREEN_THREE_PEAK_END);
          opacity = Math.max(0, Math.min(1, 1 - t));
          translateY = -((1 - opacity) * 30);
        }

        screenThreeOverlay.style.opacity = opacity.toFixed(3);
        screenThreeOverlay.style.transform = `translateY(${translateY.toFixed(1)}px)`;
        const isThreeActive = opacity > 0.2;
        screenThreeOverlay.style.pointerEvents = isThreeActive ? 'auto' : 'none';
        screenThreeOverlay.style.visibility = isThreeActive ? 'visible' : 'hidden';
        screenThreeOverlay.classList.toggle('active', isThreeActive);
      } else {
        screenThreeOverlay.style.opacity = '0';
        screenThreeOverlay.style.pointerEvents = 'none';
        screenThreeOverlay.style.visibility = 'hidden';
        screenThreeOverlay.classList.remove('active');
      }
    }

    // 4. Screen Four Overlay (Frames 580 -> 800, peak at 650-800)
    if (screenFourOverlay) {
      if (frame >= SCREEN_FOUR_FADE_IN_START) {
        let opacity = 1;
        let translateY = 0;
        if (frame < SCREEN_FOUR_PEAK_START) {
          const t = (frame - SCREEN_FOUR_FADE_IN_START) / (SCREEN_FOUR_PEAK_START - SCREEN_FOUR_FADE_IN_START);
          opacity = Math.max(0, Math.min(1, t));
          translateY = (1 - opacity) * 30;
        } else {
          opacity = 1;
          translateY = 0;
        }

        screenFourOverlay.style.opacity = opacity.toFixed(3);
        screenFourOverlay.style.transform = `translateY(${translateY.toFixed(1)}px)`;
        const isFourActive = opacity > 0.25;
        screenFourOverlay.style.pointerEvents = isFourActive ? 'auto' : 'none';
        screenFourOverlay.style.visibility = isFourActive ? 'visible' : 'hidden';
        screenFourOverlay.classList.toggle('active', isFourActive);
      } else {
        screenFourOverlay.style.opacity = '0';
        screenFourOverlay.style.pointerEvents = 'none';
        screenFourOverlay.style.visibility = 'hidden';
        screenFourOverlay.classList.remove('active');
      }
    }

    // 5. Navbar Active Indicator Synchronizer
    if (navLinkHome && navLinkAbout && navLinkAchievements) {
      if (frame < 100) {
        navLinkHome.classList.add('active');
        navLinkAbout.classList.remove('active');
        navLinkAchievements.classList.remove('active');
        if (navLinkMembers) navLinkMembers.classList.remove('active');
        if (navLinkContact) navLinkContact.classList.remove('active');
      } else if (frame >= 100 && frame < 360) {
        navLinkHome.classList.remove('active');
        navLinkAbout.classList.add('active');
        navLinkAchievements.classList.remove('active');
        if (navLinkMembers) navLinkMembers.classList.remove('active');
        if (navLinkContact) navLinkContact.classList.remove('active');
      } else if (frame >= 360 && frame < 680) {
        navLinkHome.classList.remove('active');
        navLinkAbout.classList.remove('active');
        navLinkAchievements.classList.add('active');
        if (navLinkMembers) navLinkMembers.classList.remove('active');
        if (navLinkContact) navLinkContact.classList.remove('active');
      } else {
        navLinkHome.classList.remove('active');
        navLinkAbout.classList.remove('active');
        navLinkAchievements.classList.remove('active');
        if (navLinkMembers) navLinkMembers.classList.add('active');
        if (navLinkContact) navLinkContact.classList.remove('active');
      }
    }
  }

  // --- 8. Smooth Cinematic Navigation Controller ---
  function smoothScrollToFrame(targetF, duration = 850) {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const destScroll = maxScroll > 0 ? (targetF / TIMELINE_MAX_FRAME) * maxScroll : 0;

    targetFrame = targetF;
    prioritizeAround(targetF);

    const startScroll = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
    const diff = destScroll - startScroll;
    if (Math.abs(diff) < 2) {
      window.scrollTo(0, destScroll);
      updateScroll();
      return;
    }

    const startTime = performance.now();

    function step(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(1, elapsed / duration);
      // Smooth easeInOutCubic
      const ease = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      const currentScroll = startScroll + diff * ease;
      window.scrollTo(0, currentScroll);
      updateScroll();

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        window.scrollTo(0, destScroll);
        updateScroll();
      }
    }

    requestAnimationFrame(step);
  }

  // Global methods accessible directly from inline onclick
  window.goToHome = function (e) {
    if (e) { if (e.preventDefault) e.preventDefault(); if (e.stopPropagation) e.stopPropagation(); }
    targetFrame = 0;
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (err) { window.scrollTo(0, 0); }
    return false;
  };

  window.goToAbout = function (e) {
    if (e) { if (e.preventDefault) e.preventDefault(); if (e.stopPropagation) e.stopPropagation(); }
    smoothScrollToFrame(215);
    return false;
  };

  window.goToAchievements = function (e) {
    if (e) { if (e.preventDefault) e.preventDefault(); if (e.stopPropagation) e.stopPropagation(); }
    smoothScrollToFrame(455);
    return false;
  };

  window.goToMembers = function (e) {
    if (e) { if (e.preventDefault) e.preventDefault(); if (e.stopPropagation) e.stopPropagation(); }
    smoothScrollToFrame(745);
    if (screenFourScrollWrapper) {
      screenFourScrollWrapper.scrollTo({ top: 0, behavior: 'smooth' });
    }
    return false;
  };

  window.goToContact = function (e) {
    if (e) { if (e.preventDefault) e.preventDefault(); if (e.stopPropagation) e.stopPropagation(); }
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: maxScroll, behavior: 'smooth' });
    setTimeout(() => {
      const contactEl = document.getElementById('contact');
      if (contactEl && screenFourScrollWrapper) {
        contactEl.scrollIntoView({ behavior: 'smooth' });
      }
    }, 300);
    return false;
  };

  function initNavbarClicks() {
    if (navLinkHome) {
      navLinkHome.onclick = window.goToHome;
      navLinkHome.addEventListener('click', window.goToHome);
    }

    if (navLinkAbout) {
      navLinkAbout.onclick = window.goToAbout;
      navLinkAbout.addEventListener('click', window.goToAbout);
    }

    if (navLinkAchievements) {
      navLinkAchievements.onclick = window.goToAchievements;
      navLinkAchievements.addEventListener('click', window.goToAchievements);
    }

    if (navLinkMembers) {
      navLinkMembers.onclick = window.goToMembers;
      navLinkMembers.addEventListener('click', window.goToMembers);
    }

    if (navLinkContact) {
      navLinkContact.onclick = window.goToContact;
      navLinkContact.addEventListener('click', window.goToContact);
    }

    // Hero Screen CTA Buttons: "Explore Our Journey" & "About Us"
    const btnPrimaryJourney = document.querySelector('.btn-primary-journey');
    if (btnPrimaryJourney) {
      btnPrimaryJourney.onclick = window.goToAchievements;
      btnPrimaryJourney.addEventListener('click', window.goToAchievements);
    }

    const btnSecondaryAbout = document.querySelector('.btn-secondary-about');
    if (btnSecondaryAbout) {
      btnSecondaryAbout.onclick = window.goToAbout;
      btnSecondaryAbout.addEventListener('click', window.goToAbout);
    }

    const scrollInvitation = document.querySelector('.scroll-invitation-bottom');
    if (scrollInvitation) {
      scrollInvitation.style.cursor = 'pointer';
      scrollInvitation.onclick = window.goToAbout;
      scrollInvitation.addEventListener('click', window.goToAbout);
    }

    // Button: "Contact Us Below" inside members screen
    const btnGotoContact = document.querySelector('.btn-goto-contact');
    if (btnGotoContact) {
      btnGotoContact.addEventListener('click', (e) => {
        e.preventDefault();
        const contactEl = document.getElementById('contact');
        if (contactEl && screenFourScrollWrapper) {
          contactEl.scrollIntoView({ behavior: 'smooth' });
        }
      });
    }

    // Footer Links Navigation
    const footerLinkHome = document.getElementById('footer-link-home');
    if (footerLinkHome) {
      footerLinkHome.addEventListener('click', (e) => {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    const footerLinkAbout = document.getElementById('footer-link-about');
    if (footerLinkAbout) {
      footerLinkAbout.addEventListener('click', (e) => {
        e.preventDefault();
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo({ top: (215 / TIMELINE_MAX_FRAME) * maxScroll, behavior: 'smooth' });
      });
    }

    const footerLinkAchieve = document.getElementById('footer-link-achieve');
    if (footerLinkAchieve) {
      footerLinkAchieve.addEventListener('click', (e) => {
        e.preventDefault();
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo({ top: (455 / TIMELINE_MAX_FRAME) * maxScroll, behavior: 'smooth' });
      });
    }

    const footerLinkMembers = document.getElementById('footer-link-members');
    if (footerLinkMembers) {
      footerLinkMembers.addEventListener('click', (e) => {
        e.preventDefault();
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo({ top: (745 / TIMELINE_MAX_FRAME) * maxScroll, behavior: 'smooth' });
        if (screenFourScrollWrapper) {
          screenFourScrollWrapper.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    }

    const footerLinkContact = document.getElementById('footer-link-contact');
    if (footerLinkContact) {
      footerLinkContact.addEventListener('click', (e) => {
        e.preventDefault();
        const contactEl = document.getElementById('contact');
        if (contactEl && screenFourScrollWrapper) {
          contactEl.scrollIntoView({ behavior: 'smooth' });
        }
      });
    }
  }

  // --- Screen 4 Instant Reverse & Seamless Scroll Forwarding ---
  function initScreenFourScrollHandling() {
    if (!screenFourScrollWrapper) return;

    screenFourScrollWrapper.addEventListener('wheel', (e) => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const currentWindowScroll = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;

      // When scrolling UP and inner wrapper is at or near top:
      // Instantly forward to window scroll backward (bypasses browser overscroll trap/delay)
      if (e.deltaY < 0 && screenFourScrollWrapper.scrollTop <= 2) {
        e.preventDefault();
        window.scrollBy({ top: e.deltaY, behavior: 'auto' });
        return;
      }

      // When scrolling DOWN and window has not yet reached bottom of canvas timeline:
      // Forward to window scroll to finish the entrance into the lab first
      if (e.deltaY > 0 && currentWindowScroll < maxScroll - 2) {
        e.preventDefault();
        window.scrollBy({ top: e.deltaY, behavior: 'auto' });
        return;
      }
    }, { passive: false });
  }

  // --- 9. Background Progressive Preloader ---
  function startBackgroundLoader() {
    // Phase 1: Load frame 0, frame 200, frame 450, and frame 750 immediately
    requestFrame(0, true);
    requestFrame(200, true);
    requestFrame(450, true);
    requestFrame(750, true);

    // Phase 2: Keyframes across the sequence
    for (let i = 0; i < TOTAL_FRAMES; i += 10) {
      requestFrame(i);
    }
    requestFrame(TOTAL_FRAMES - 1);

    // Phase 3: Load remaining frames in batches
    let currentIdx = 0;
    function loadBatch() {
      if (currentIdx >= TOTAL_FRAMES) return;
      for (let i = 0; i < 15 && currentIdx < TOTAL_FRAMES; i++) {
        requestFrame(currentIdx);
        currentIdx++;
      }
      setTimeout(loadBatch, 30);
    }

    setTimeout(loadBatch, 150);
  }

  // --- 10. Achievements 3D Continuous Rotating Carousel ---
  function initAchievementsCarousel() {
    const stage = document.getElementById('achieve-3d-stage');
    const cylinder = document.getElementById('achieve-cylinder');
    const cards = document.querySelectorAll('.achieve-card');
    const dots = document.querySelectorAll('.achieve-dot');
    const btnPrev = document.getElementById('carousel-btn-prev');
    const btnNext = document.getElementById('carousel-btn-next');
    const btnVideoPrev = document.getElementById('btn-video-prev');
    const btnVideoNext = document.getElementById('btn-video-next');

    if (!cylinder || cards.length === 0) return;

    const total = cards.length;
    const angleStep = 360 / total; // 45 deg
    const radius = 270; // 3D radius for compact cards

    let currentAngle = 0;       // Continuous smooth angle in degrees
    let targetAngle = 0;        // Target angle when clicking next/prev
    let isInteracting = false;  // When user is hovering
    let isSnapping = false;     // When animating towards a specific clicked target
    let snapResumeTimer = null;
    const ROTATION_SPEED = 0.16; // Smooth continuous rotation speed (deg per frame)

    // Position cards initially on the cylinder
    cards.forEach((card, idx) => {
      const cardAngle = idx * angleStep;
      card.style.transform = `rotateY(${cardAngle}deg) translateZ(${radius}px)`;
    });

    cylinder.style.transition = 'none';

    function renderCarousel() {
      cylinder.style.transform = `rotateY(${-currentAngle}deg)`;

      let closestCardIdx = 0;
      let minDistance = 999;

      cards.forEach((card, idx) => {
        const cardAngle = idx * angleStep;
        let relAngle = (cardAngle - (currentAngle % 360) + 540) % 360 - 180;
        const absDist = Math.abs(relAngle);

        if (absDist < minDistance) {
          minDistance = absDist;
          closestCardIdx = idx;
        }

        // Normalized front factor (1.0 at front center, 0 at 85+ deg sides)
        const frontFactor = Math.max(0, 1 - absDist / 85);
        const scale = 0.82 + (0.24 * frontFactor);
        const opacity = 0.28 + (0.72 * frontFactor);
        const zIndex = Math.round(100 - absDist);

        card.style.transform = `rotateY(${cardAngle}deg) translateZ(${radius}px) scale(${scale.toFixed(3)})`;
        card.style.opacity = opacity.toFixed(3);
        card.style.zIndex = zIndex;

        if (frontFactor > 0.72) {
          card.classList.add('is-active');
        } else {
          card.classList.remove('is-active');
        }
      });

      dots.forEach((dot, idx) => {
        dot.classList.toggle('active', idx === closestCardIdx);
      });
    }

    function animate() {
      if (isSnapping) {
        const delta = targetAngle - currentAngle;
        if (Math.abs(delta) > 0.05) {
          currentAngle += delta * 0.12;
        } else {
          currentAngle = targetAngle;
          isSnapping = false;
        }
      } else if (!isInteracting) {
        currentAngle += ROTATION_SPEED;
        targetAngle = currentAngle;
      }

      renderCarousel();
      requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);

    if (stage) {
      stage.addEventListener('mouseenter', () => { isInteracting = true; });
      stage.addEventListener('mouseleave', () => {
        if (!isSnapping) isInteracting = false;
      });
    }

    function snapToAngle(angle) {
      isSnapping = true;
      targetAngle = angle;
      if (snapResumeTimer) clearTimeout(snapResumeTimer);
      snapResumeTimer = setTimeout(() => {
        isSnapping = false;
        isInteracting = false;
      }, 3000);
    }

    function stepNext() {
      const nextAngle = (Math.floor(currentAngle / angleStep) + 1) * angleStep;
      snapToAngle(nextAngle);
    }

    function stepPrev() {
      const prevAngle = (Math.ceil(currentAngle / angleStep) - 1) * angleStep;
      snapToAngle(prevAngle);
    }

    if (btnNext) btnNext.addEventListener('click', stepNext);
    if (btnPrev) btnPrev.addEventListener('click', stepPrev);
    if (btnVideoNext) btnVideoNext.addEventListener('click', stepNext);
    if (btnVideoPrev) btnVideoPrev.addEventListener('click', stepPrev);

    dots.forEach((dot, idx) => {
      dot.addEventListener('click', () => {
        const currentTurns = Math.floor(currentAngle / 360) * 360;
        let dest = currentTurns + (idx * angleStep);
        if (dest < currentAngle - 180) dest += 360;
        if (dest > currentAngle + 180) dest -= 360;
        snapToAngle(dest);
      });
    });

    cards.forEach((card, idx) => {
      card.addEventListener('click', () => {
        const currentTurns = Math.floor(currentAngle / 360) * 360;
        let dest = currentTurns + (idx * angleStep);
        if (dest < currentAngle - 180) dest += 360;
        if (dest > currentAngle + 180) dest -= 360;
        snapToAngle(dest);
      });
    });
  }

  // --- 11. Achievements Video Player ---
  function initAchievementsVideo() {
    const video = document.getElementById('achieve-video');
    const playBtn = document.getElementById('video-play-toggle');
    const playSvg = playBtn ? playBtn.querySelector('.play-icon-svg') : null;
    const pauseSvg = playBtn ? playBtn.querySelector('.pause-icon-svg') : null;
    const timeDisplay = document.getElementById('video-time');
    const seekTrack = document.getElementById('video-seek-track');
    const progBar = document.getElementById('video-progress-bar');
    const muteBtn = document.getElementById('video-mute-toggle');
    const fsBtn = document.getElementById('video-fullscreen-toggle');
    const container = video ? video.closest('.video-frame-container') : null;
    const controlsBottom = document.querySelector('.video-controls-bottom');
    const infoLeft = document.querySelector('.video-info-left');

    if (!video) return;

    function formatTime(seconds) {
      const m = Math.floor(seconds / 60) || 0;
      const s = Math.floor(seconds % 60) || 0;
      return `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    const bottomPlayBtn = document.getElementById('video-bottom-play-toggle');

    function updatePlayState(isPlaying) {
      const allPlaySvgs = document.querySelectorAll('.play-icon-svg');
      const allPauseSvgs = document.querySelectorAll('.pause-icon-svg');
      allPlaySvgs.forEach(s => s.style.display = isPlaying ? 'none' : 'block');
      allPauseSvgs.forEach(s => s.style.display = isPlaying ? 'block' : 'none');

      if (playBtn) {
        playBtn.style.opacity = isPlaying ? '0' : '1';
        playBtn.style.pointerEvents = isPlaying ? 'none' : 'auto';
      }
    }

    // Keep UI state synchronized with native media events
    video.addEventListener('play', () => updatePlayState(true));
    video.addEventListener('playing', () => updatePlayState(true));
    video.addEventListener('pause', () => updatePlayState(false));
    video.addEventListener('ended', () => updatePlayState(false));

    let lastToggleTime = 0;
    function togglePlay(e) {
      if (e) {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
      }

      const now = Date.now();
      if (now - lastToggleTime < 300) return;
      lastToggleTime = now;

      if (video.paused || video.ended) {
        const promise = video.play();
        if (promise !== undefined) {
          promise
            .then(() => {
              updatePlayState(true);
            })
            .catch((err) => {
              console.warn("Direct video play blocked by browser, retrying with muted audio:", err);
              video.muted = true;
              if (muteBtn) muteBtn.style.opacity = '0.5';
              video.play()
                .then(() => updatePlayState(true))
                .catch((err2) => {
                  console.error("Playback failed completely:", err2);
                });
            });
        }
      } else {
        video.pause();
        updatePlayState(false);
      }
    }

    window.toggleAchievementVideo = togglePlay;

    // Attach click listeners to all intuitive trigger elements
    if (playBtn) {
      playBtn.addEventListener('click', togglePlay);
    }
    if (bottomPlayBtn) {
      bottomPlayBtn.addEventListener('click', togglePlay);
    }
    video.addEventListener('click', togglePlay);
    if (infoLeft) {
      infoLeft.addEventListener('click', togglePlay);
    }

    // Prevent bottom controls clicks from triggering play/pause
    if (controlsBottom) {
      controlsBottom.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }

    video.addEventListener('play', () => updatePlayState(true));
    video.addEventListener('pause', () => updatePlayState(false));

    video.addEventListener('timeupdate', () => {
      if (!video.duration) return;
      const progress = (video.currentTime / video.duration) * 100;
      if (progBar) progBar.style.width = `${progress}%`;
      if (timeDisplay) {
        timeDisplay.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
      }
    });

    video.addEventListener('loadedmetadata', () => {
      if (timeDisplay) {
        timeDisplay.textContent = `0:00 / ${formatTime(video.duration)}`;
      }
    });

    video.addEventListener('error', () => {
      console.warn("Video failed loading primary source, trying fallback source...");
      if (!video.src.includes('achievementS (1).mp4')) {
        video.src = 'achievementS (1).mp4';
        video.load();
      }
    });

    if (seekTrack) {
      seekTrack.addEventListener('click', (e) => {
        e.stopPropagation();
        const rect = seekTrack.getBoundingClientRect();
        const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        if (video.duration) {
          video.currentTime = pos * video.duration;
        }
      });
    }

    if (muteBtn) {
      muteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        video.muted = !video.muted;
        muteBtn.style.opacity = video.muted ? '0.5' : '1';
      });
    }

    if (fsBtn) {
      fsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!document.fullscreenElement) {
          if (container && container.requestFullscreen) {
            container.requestFullscreen().catch(() => {
              video.requestFullscreen().catch(() => {});
            });
          } else {
            video.requestFullscreen().catch(() => {});
          }
        } else {
          document.exitFullscreen().catch(() => {});
        }
      });
    }

    if (container) {
      container.addEventListener('mouseenter', () => {
        if (!video.paused && playBtn) playBtn.style.opacity = '0.85';
      });
      container.addEventListener('mouseleave', () => {
        if (!video.paused && playBtn) playBtn.style.opacity = '0';
      });
    }
  }

  // Handle URL hash navigation on initial load and hashchange
  function handleHashNavigation() {
    const hash = (window.location.hash || '').toLowerCase();
    if (hash === '#achievements') {
      setTimeout(() => { if (window.goToAchievements) window.goToAchievements(); }, 150);
    } else if (hash === '#about') {
      setTimeout(() => { if (window.goToAbout) window.goToAbout(); }, 150);
    } else if (hash === '#members') {
      setTimeout(() => { if (window.goToMembers) window.goToMembers(); }, 150);
    } else if (hash === '#contact') {
      setTimeout(() => { if (window.goToContact) window.goToContact(); }, 150);
    } else if (hash === '#home') {
      setTimeout(() => { if (window.goToHome) window.goToHome(); }, 150);
    }
  }

  // --- 12. Initialization ---
  function init() {
    initPreloader();
    window.addEventListener('resize', resizeCanvas, { passive: true });
    window.addEventListener('scroll', updateScroll, { passive: true });
    window.addEventListener('hashchange', handleHashNavigation, { passive: true });

    resizeCanvas();
    startBackgroundLoader();
    initNavbarClicks();
    initScreenFourScrollHandling();
    initAchievementsCarousel();
    initAchievementsVideo();
    updateScroll();
    updateOverlays(currentFrame);
    loop();
    handleHashNavigation();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
