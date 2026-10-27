
"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const troubleshootingItems = document.querySelectorAll(
        ".troubleshooting-item"
    );

    // Keep the troubleshooting guide compact by allowing one
    // question to remain expanded at a time.
    troubleshootingItems.forEach((item) => {
        item.addEventListener("toggle", () => {
            if (!item.open) {
                return;
            }

            troubleshootingItems.forEach((otherItem) => {
                if (otherItem !== item) {
                    otherItem.open = false;
                }
            });
        });
    });
});
