/*
Logo easter-egg extracted from loopInit.
Exports setupLogoEgg()
*/
export function setupLogoEgg() {
  const logoContainer = document.getElementById("logoContainer");
  if (!logoContainer) return;
  const logoImg = logoContainer.querySelector("img");
  const logoGif = logoContainer.querySelector("img[data-gif]");
  let clickCount = 0;
  let resetTimeout = null;
  
  logoContainer.addEventListener("click", () => {
    clickCount++;
    if (resetTimeout) clearTimeout(resetTimeout);
    
    if (clickCount >= 5) {
      if (logoImg) logoImg.style.display = "none";
      if (logoGif) logoGif.style.display = "block";
      clickCount = 0;
    }
    
    resetTimeout = setTimeout(() => {
      clickCount = 0;
      if (logoImg) logoImg.style.display = "block";
      if (logoGif) logoGif.style.display = "none";
    }, 2000);
  });
}

