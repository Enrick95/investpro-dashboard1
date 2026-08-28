"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  BookOpen,
  CheckSquare,
  Download,
  FileText,
  FolderOpen,
  GraduationCap,
  Link as LinkIcon,
  PlayCircle,
  Search,
  Sparkles,
  Wrench,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

/* =========================================================
   TYPES
========================================================= */

type Resource = {
  id: number | string;

  title?: string | null;
  name?: string | null;

  description?: string | null;

  type?: string | null;
  resource_type?: string | null;
  category?: string | null;

  url?: string | null;
  file_url?: string | null;
  link?: string | null;

  course_id?: number | string | null;

  created_at?: string | null;

  [key: string]: any;
};

type ResourceCategory =
  | "all"
  | "pdf"
  | "guide"
  | "checklist"
  | "template"
  | "video"
  | "outil"
  | "autre";

/* =========================================================
   HELPERS
========================================================= */

function getTitle(
  resource: Resource
) {
  return (
    resource.title ||
    resource.name ||
    "Ressource InvestPro"
  );
}

function getDescription(
  resource: Resource
) {
  return (
    resource.description ||
    "Ressource disponible dans la bibliothèque InvestPro."
  );
}

function getUrl(
  resource: Resource
) {
  return (
    resource.url ||
    resource.file_url ||
    resource.link ||
    null
  );
}

function rawType(
  resource: Resource
) {
  return String(
    resource.resource_type ||
      resource.type ||
      resource.category ||
      "autre"
  )
    .trim()
    .toLowerCase();
}

function normalizeCategory(
  resource: Resource
): ResourceCategory {
  const value =
    rawType(
      resource
    );

  if (
    value.includes("pdf")
  ) {
    return "pdf";
  }

  if (
    value.includes("guide") ||
    value.includes("ebook") ||
    value.includes("e-book")
  ) {
    return "guide";
  }

  if (
    value.includes("check") ||
    value.includes("checklist")
  ) {
    return "checklist";
  }

  if (
    value.includes("template") ||
    value.includes("modèle") ||
    value.includes("modele")
  ) {
    return "template";
  }

  if (
    value.includes("video") ||
    value.includes("vidéo") ||
    value.includes("youtube")
  ) {
    return "video";
  }

  if (
    value.includes("outil") ||
    value.includes("tool")
  ) {
    return "outil";
  }

  return "autre";
}

function categoryLabel(
  category: ResourceCategory
) {
  switch (
    category
  ) {
    case "pdf":
      return "PDF";

    case "guide":
      return "Guides";

    case "checklist":
      return "Checklists";

    case "template":
      return "Templates";

    case "video":
      return "Vidéos";

    case "outil":
      return "Outils";

    case "autre":
      return "Autres";

    default:
      return "Tout";
  }
}

function categoryIcon(
  category: ResourceCategory
) {
  switch (
    category
  ) {
    case "pdf":
      return (
        <FileText
          size={18}
        />
      );

    case "guide":
      return (
        <BookOpen
          size={18}
        />
      );

    case "checklist":
      return (
        <CheckSquare
          size={18}
        />
      );

    case "template":
      return (
        <FolderOpen
          size={18}
        />
      );

    case "video":
      return (
        <PlayCircle
          size={18}
        />
      );

    case "outil":
      return (
        <Wrench
          size={18}
        />
      );

    default:
      return (
        <Sparkles
          size={18}
        />
      );
  }
}

/* =========================================================
   PAGE
========================================================= */

export default function AcademyBibliothequePage() {
  const supabase =
    useMemo(
      () =>
        createClient(),
      []
    );

  const [
    resources,
    setResources,
  ] =
    useState<Resource[]>(
      []
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    );

  const [
    search,
    setSearch,
  ] =
    useState("");

  const [
    category,
    setCategory,
  ] =
    useState<ResourceCategory>(
      "all"
    );

  /* =======================================================
     LOAD
  ======================================================= */

  useEffect(() => {
    loadResources();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadResources() {
    try {
      setLoading(
        true
      );

      const {
        data: {
          user,
        },
        error:
          userError,
      } =
        await supabase.auth.getUser();

      if (
        userError ||
        !user
      ) {
        window.location.href =
          "/login";

        return;
      }

      const {
        data,
        error,
      } =
        await supabase
          .from(
            "academy_resources"
          )
          .select("*")
          .order(
            "created_at",
            {
              ascending:
                false,
            }
          );

      if (
        error
      ) {
        console.error(
          "Erreur bibliothèque Academy :",
          error
        );

        setResources(
          []
        );

        return;
      }

      setResources(
        (
          data as Resource[]
        ) || []
      );
    } finally {
      setLoading(
        false
      );
    }
  }

  /* =======================================================
     FILTERS
  ======================================================= */

  const filteredResources =
    useMemo(() => {
      const query =
        search
          .trim()
          .toLowerCase();

      return resources.filter(
        (
          resource
        ) => {
          const currentCategory =
            normalizeCategory(
              resource
            );

          if (
            category !==
              "all" &&
            currentCategory !==
              category
          ) {
            return false;
          }

          if (
            !query
          ) {
            return true;
          }

          const haystack =
            [
              getTitle(
                resource
              ),
              getDescription(
                resource
              ),
              rawType(
                resource
              ),
            ]
              .filter(
                Boolean
              )
              .join(
                " "
              )
              .toLowerCase();

          return haystack.includes(
            query
          );
        }
      );
    }, [
      resources,
      search,
      category,
    ]);

  /* =======================================================
     STATS
  ======================================================= */

  const stats =
    useMemo(() => {
      const count = (
        target:
          ResourceCategory
      ) =>
        resources.filter(
          (
            resource
          ) =>
            normalizeCategory(
              resource
            ) ===
            target
        ).length;

      return {
        total:
          resources.length,

        pdf:
          count(
            "pdf"
          ),

        video:
          count(
            "video"
          ),

        tools:
          count(
            "outil"
          ),
      };
    }, [
      resources,
    ]);

  if (
    loading
  ) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center text-sm text-[color:var(--muted)]">
        Chargement de la bibliothèque…
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-10">
      {/* =====================================================
          HEADER
      ===================================================== */}

      <div>
        <div
          className="
            mb-3
            inline-flex
            items-center
            gap-2
            rounded-full
            border
            border-[color:var(--gold-border)]
            bg-[color:var(--gold-soft)]
            px-3
            py-1.5
            text-[10px]
            font-semibold
            uppercase
            tracking-[0.13em]
            text-[color:var(--gold)]
          "
        >
          <GraduationCap
            size={12}
          />

          Academy InvestPro
        </div>

        <h1 className="text-2xl font-semibold text-white">
          Bibliothèque
        </h1>

        <p className="mt-1 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
          Retrouve tous les PDF, guides, checklists, templates, vidéos et outils mis à disposition dans l’Academy.
        </p>
      </div>

      {/* =====================================================
          HERO
      ===================================================== */}

      <section
        className="
          relative
          overflow-hidden
          rounded-[26px]
          border
          border-[color:var(--gold-border)]
          bg-[#0b0b0d]
          p-6
          md:p-7
        "
      >
        <div
          className="
            pointer-events-none
            absolute
            -right-20
            -top-24
            h-[320px]
            w-[320px]
            rounded-full
            bg-[color:var(--gold)]
            opacity-[0.08]
            blur-[100px]
          "
        />

        <div className="relative z-10 grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-7">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--gold)]">
              Ressources pédagogiques
            </div>

            <h2 className="mt-2 text-xl font-semibold text-white md:text-2xl">
              Tout ce qu’il te faut pour progresser
            </h2>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
              Une bibliothèque centralisée pour retrouver rapidement les supports InvestPro utiles à ton apprentissage.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-5">
            <MiniStat
              label="Ressources"
              value={String(
                stats.total
              )}
            />

            <MiniStat
              label="PDF"
              value={String(
                stats.pdf
              )}
            />

            <MiniStat
              label="Vidéos"
              value={String(
                stats.video
              )}
            />

            <MiniStat
              label="Outils"
              value={String(
                stats.tools
              )}
            />
          </div>
        </div>
      </section>

      {/* =====================================================
          FILTERS
      ===================================================== */}

      <section
        className="
          rounded-[22px]
          border
          border-[color:var(--border)]
          bg-[color:var(--panel)]
          p-4
        "
      >
        <div className="flex flex-col gap-4">
          <div className="relative">
            <Search
              size={15}
              className="
                absolute
                left-4
                top-1/2
                -translate-y-1/2
                text-white/30
              "
            />

            <input
              value={
                search
              }
              onChange={(
                event
              ) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Rechercher un PDF, guide, checklist..."
              className="
                h-11
                w-full
                rounded-xl
                border
                border-[color:var(--border)]
                bg-black/20
                pl-11
                pr-4
                text-sm
                text-white
                outline-none
                placeholder:text-white/25
                focus:border-[color:var(--gold-border)]
              "
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {(
              [
                "all",
                "pdf",
                "guide",
                "checklist",
                "template",
                "video",
                "outil",
                "autre",
              ] as ResourceCategory[]
            ).map(
              (
                item
              ) => (
                <button
                  key={
                    item
                  }
                  type="button"
                  onClick={() =>
                    setCategory(
                      item
                    )
                  }
                  className={[
                    "rounded-xl border px-3 py-2 text-[10px] font-semibold transition",

                    category ===
                    item
                      ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)] text-[color:var(--gold)]"
                      : "border-white/10 bg-white/[0.02] text-white/45 hover:text-white",
                  ].join(
                    " "
                  )}
                >
                  {categoryLabel(
                    item
                  )}
                </button>
              )
            )}
          </div>
        </div>
      </section>

      {/* =====================================================
          LIBRARY
      ===================================================== */}

      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">
              Ressources disponibles
            </h2>

            <p className="mt-1 text-xs text-[color:var(--muted)]">
              {
                filteredResources.length
              }{" "}
              ressource
              {filteredResources.length !==
              1
                ? "s"
                : ""}
            </p>
          </div>

          <FolderOpen
            size={18}
            className="text-[color:var(--gold)]"
          />
        </div>

        {filteredResources.length ===
        0 ? (
          <div
            className="
              rounded-[22px]
              border
              border-dashed
              border-white/[0.08]
              bg-[color:var(--panel)]
              p-12
              text-center
            "
          >
            <BookOpen
              size={28}
              className="mx-auto text-white/15"
            />

            <div className="mt-4 text-sm font-semibold text-white">
              Aucune ressource disponible
            </div>

            <p className="mt-1 text-xs text-[color:var(--muted)]">
              Les prochaines ressources de l’Academy apparaîtront ici.
            </p>
          </div>
        ) : (
          <div
            className="
              grid
              grid-cols-1
              gap-4
              md:grid-cols-2
              xl:grid-cols-3
              2xl:grid-cols-4
            "
          >
            {filteredResources.map(
              (
                resource
              ) => (
                <ResourceCard
                  key={
                    resource.id
                  }
                  resource={
                    resource
                  }
                />
              )
            )}
          </div>
        )}
      </section>

      {/* =====================================================
          INFO
      ===================================================== */}

      <section
        className="
          flex
          items-start
          gap-3
          rounded-[20px]
          border
          border-white/[0.07]
          bg-black/20
          p-5
        "
      >
        <div
          className="
            flex
            h-10
            w-10
            shrink-0
            items-center
            justify-center
            rounded-xl
            border
            border-[color:var(--gold-border)]
            bg-[color:var(--gold-soft)]
            text-[color:var(--gold)]
          "
        >
          <Sparkles
            size={17}
          />
        </div>

        <div>
          <div className="text-xs font-semibold text-white">
            Bibliothèque évolutive
          </div>

          <p className="mt-1 max-w-3xl text-[10px] leading-5 text-[color:var(--muted)]">
            Tu pourras ajouter progressivement tes PDF, checklists, guides et autres supports directement dans la table academy_resources.
          </p>
        </div>
      </section>
    </div>
  );
}

/* =========================================================
   COMPONENTS
========================================================= */

function ResourceCard({
  resource,
}: {
  resource:
    Resource;
}) {
  const currentCategory =
    normalizeCategory(
      resource
    );

  const url =
    getUrl(
      resource
    );

  const isDownload =
    currentCategory ===
      "pdf" ||
    currentCategory ===
      "guide" ||
    currentCategory ===
      "checklist" ||
    currentCategory ===
      "template";

  return (
    <article
      className="
        group
        relative
        overflow-hidden
        rounded-[22px]
        border
        border-[color:var(--border)]
        bg-[color:var(--panel)]
        p-5
        transition
        hover:border-[color:var(--gold-border)]
      "
    >
      <div
        className="
          pointer-events-none
          absolute
          -right-16
          -top-16
          h-40
          w-40
          rounded-full
          bg-[color:var(--gold)]
          opacity-0
          blur-[55px]
          transition
          group-hover:opacity-[0.06]
        "
      />

      <div className="relative flex items-start justify-between gap-3">
        <div
          className="
            flex
            h-11
            w-11
            shrink-0
            items-center
            justify-center
            rounded-xl
            border
            border-[color:var(--gold-border)]
            bg-[color:var(--gold-soft)]
            text-[color:var(--gold)]
          "
        >
          {categoryIcon(
            currentCategory
          )}
        </div>

        <span
          className="
            rounded-full
            border
            border-[color:var(--gold-border)]
            bg-black/20
            px-2.5
            py-1
            text-[8px]
            font-bold
            uppercase
            text-[color:var(--gold)]
          "
        >
          {categoryLabel(
            currentCategory
          )}
        </span>
      </div>

      <div className="relative mt-5">
        <h2 className="line-clamp-2 text-sm font-semibold text-white">
          {getTitle(
            resource
          )}
        </h2>

        <p
          className="
            mt-2
            min-h-[60px]
            line-clamp-3
            text-[10px]
            leading-5
            text-[color:var(--muted)]
          "
        >
          {getDescription(
            resource
          )}
        </p>
      </div>

      {url ? (
        <a
          href={
            url
          }
          target="_blank"
          rel="noreferrer"
          className="
            relative
            mt-5
            flex
            h-10
            w-full
            items-center
            justify-center
            gap-2
            rounded-xl
            border
            border-[color:var(--gold-border)]
            bg-[color:var(--gold-soft)]
            text-[10px]
            font-semibold
            text-[color:var(--gold)]
            no-underline
            transition
            hover:bg-white/[0.05]
          "
        >
          {isDownload ? (
            <>
              <Download
                size={13}
              />

              Ouvrir la ressource
            </>
          ) : (
            <>
              <LinkIcon
                size={13}
              />

              Accéder
            </>
          )}
        </a>
      ) : (
        <div
          className="
            relative
            mt-5
            flex
            h-10
            w-full
            items-center
            justify-center
            rounded-xl
            border
            border-white/[0.06]
            bg-black/20
            text-[10px]
            text-white/25
          "
        >
          Ressource bientôt disponible
        </div>
      )}
    </article>
  );
}

function MiniStat({
  label,
  value,
}: {
  label:
    string;

  value:
    string;
}) {
  return (
    <div
      className="
        rounded-xl
        border
        border-white/[0.07]
        bg-black/20
        px-4
        py-3
      "
    >
      <div className="text-[9px] text-[color:var(--muted)]">
        {label}
      </div>

      <div className="mt-1 text-sm font-semibold text-white">
        {value}
      </div>
    </div>
  );
}