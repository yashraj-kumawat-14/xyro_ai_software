
"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const sectionLinks = document.querySelectorAll(
        '.contents a[href^="#"]'
    );

    sectionLinks.forEach((link) => {
        link.addEventListener("click", () => {
            const targetId = link.getAttribute("href").slice(1);
            const target = document.getElementById(targetId);

            if (!target) {
                return;
            }

            // Allow keyboard users to focus the selected section.
            if (!target.hasAttribute("tabindex")) {
                target.setAttribute("tabindex", "-1");
            }

            window.setTimeout(() => {
                target.focus({ preventScroll: true });
            }, 350);
        });
    });
});
