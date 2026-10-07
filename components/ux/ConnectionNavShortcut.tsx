"use client";

import { useEffect } from "react";

const LINK_HREF = "/dashboard/connexions";
const LABEL = "Connexions";

function buildLink(template: HTMLAnchorElement) {
  const link = template.cloneNode(true) as HTMLAnchorElement;
  link.href = LINK_HREF;
  link.setAttribute("data-investpro-connections-link", "true");
  link.removeAttribute("aria-current");

  const span = link.querySelector("span");
  if (span) span.textContent = LABEL;

  const small = link.querySelector("small");
  if (small) small.remove();

  // Remplace uniquement l'icône SVG, tout en conservant les classes/styles du menu.
  const svg = link.querySelector("svg");
  if (svg) {
    svg.outerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"
        viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        aria-hidden="true">
        <path d="M9 18V5l12-2v13"/>
        <circle cx="6" cy="18" r="3"/>
        <circle cx="18" cy="16" r="3"/>
      </svg>
    `;
  }

  return link;
}

function injectInto(nav: ParentNode) {
  if (nav.querySelector('[data-investpro-connections-link="true"]')) return;

  const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>('a[href]'));
  const accounts = links.find((link) => {
    const href = link.getAttribute("href") || "";
    return href === "/dashboard/comptes" || href.endsWith("/dashboard/comptes");
  });

  if (!accounts) return;

  const wrapper = accounts.parentElement;
  if (!wrapper) return;

  // La Sidebar desktop actuelle enveloppe chaque lien dans un <div>.
  // On clone ce wrapper pour rester 100% cohérent avec le design existant.
  const wrapperClone = wrapper.cloneNode(false) as HTMLElement;
  const link = buildLink(accounts);

  // Si le lien "Mes comptes" est actif, le clone ne doit pas conserver cet état.
  link.classList.remove("active");
  wrapperClone.appendChild(link);

  wrapper.insertAdjacentElement("afterend", wrapperClone);
}

export default function ConnectionNavShortcut() {
  useEffect(() => {
    let raf = 0;

    const refresh = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        document
          .querySelectorAll<HTMLElement>(
            ".aura-sidebar nav, .aura-mobile-menu nav"
          )
          .forEach((nav) => injectInto(nav));
      });
    };

    refresh();

    const observer = new MutationObserver(refresh);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    window.addEventListener("focus", refresh);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("focus", refresh);
    };
  }, []);

  return null;
}
