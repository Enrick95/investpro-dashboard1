"use client";

import { useMemo, useRef, useState } from "react";
import { Card, CardBody } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";

type Img = {
  id: string;
  name: string;
  mime: string;
  size: number;
  dataUrl: string; // demo base64
};

const MAX_IMG_BYTES = Math.floor(1.5 * 1024 * 1024); // 1.5MB

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export default function BugPage() {
  const [where, setWhere] = useState("");
  const [desc, setDesc] = useState("");

  const [images, setImages] = useState<Img[]>([]);
  const [drag, setDrag] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const fileRef = useRef<HTMLInputElement | null>(null);

  const canSend = useMemo(() => {
    return where.trim().length >= 3 && desc.trim().length >= 10 && !sending;
  }, [where, desc, sending]);

  async function addFiles(files: FileList | File[]) {
    setErr(null);
    setOk(null);

    const arr = Array.from(files);

    for (const f of arr) {
      if (!f.type.startsWith("image/")) {
        setErr("Seules les images sont autorisées ici (png/jpg/webp/gif).");
        return;
      }
      if (f.size > MAX_IMG_BYTES) {
        setErr(`Image trop grosse : ${f.name} (max ${fmtBytes(MAX_IMG_BYTES)})`);
        return;
      }
    }

    const added: Img[] = [];
    for (const f of arr) {
      const dataUrl = await readAsDataUrl(f);
      added.push({
        id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
        name: f.name,
        mime: f.type,
        size: f.size,
        dataUrl,
      });
    }

    setImages((prev) => [...added, ...prev].slice(0, 6)); // limite 6 images
  }

  function removeImg(id: string) {
    setImages((prev) => prev.filter((x) => x.id !== id));
  }

  async function send() {
    setErr(null);
    setOk(null);

    if (!where.trim()) return setErr("Merci de remplir le champ “Où avez-vous trouvé ce bug ?”");
    if (!desc.trim()) return setErr("Merci de remplir la description.");

    setSending(true);
    try {
      const payload = {
        where,
        description: desc,
        images: images.map((i) => ({
          name: i.name,
          mime: i.mime,
          size: i.size,
          dataUrl: i.dataUrl, // démo (en prod on upload sur /api/upload)
        })),
        url: window.location.href,
        userAgent: navigator.userAgent,
        at: new Date().toISOString(),
      };

      const r = await fetch("/api/bug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || "Erreur envoi");

      setOk("✅ Merci ! Votre rapport a bien été envoyé.");
      setWhere("");
      setDesc("");
      setImages([]);
    } catch (e: any) {
      setErr("❌ " + String(e?.message ?? e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">
          Rapporter <span className="text-[color:var(--gold)]">un bug</span>
        </h1>
        <p className="text-[color:var(--muted)] mt-1">
          Décris précisément, et ajoute des images si possible.
        </p>
      </div>

      <Card>
        <CardBody>
          {err ? (
            <div className="mb-4 text-sm rounded-2xl border border-[color:var(--danger)]/25 bg-[color:var(--danger)]/10 text-[color:var(--danger)] p-3">
              {err}
            </div>
          ) : null}

          {ok ? (
            <div className="mb-4 text-sm rounded-2xl border border-[color:var(--success)]/25 bg-[color:var(--success)]/10 text-[color:var(--success)] p-3">
              {ok}
            </div>
          ) : null}

          {/* Où */}
          <label className="block">
            <div className="text-sm text-white/80 mb-2">
              Où avez-vous trouvé ce bug ? <span className="text-[color:var(--danger)]">*</span>
            </div>
            <input
              value={where}
              onChange={(e) => setWhere(e.target.value)}
              placeholder="Problème avec l’abonnement"
              className="w-full px-4 py-3 rounded-2xl bg-black/20 border border-[color:var(--border)]
                         text-white placeholder:text-white/30 outline-none
                         focus:border-[color:var(--gold-border)]
                         focus:ring-2 focus:ring-[color:var(--gold-soft)] transition"
            />
          </label>

          {/* Description */}
          <label className="block mt-5">
            <div className="text-sm text-white/80 mb-2">
              Description détaillée du bug ? <span className="text-[color:var(--danger)]">*</span>
            </div>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={5}
              placeholder="Expliquez comment vous avez fait pour rencontrer ce bug. Exemple : Je vais dans la page Paramètres, je clique sur annuler mon abonnement : mon abonnement ne s’annule pas."
              className="w-full px-4 py-3 rounded-2xl bg-black/20 border border-[color:var(--border)]
                         text-white placeholder:text-white/30 outline-none
                         focus:border-[color:var(--gold-border)]
                         focus:ring-2 focus:ring-[color:var(--gold-soft)] transition"
            />
          </label>

          {/* Dropzone */}
          <div className="mt-6">
            <div className="text-sm text-white/80 mb-2">
              Illustrations du bug <span className="text-[color:var(--muted)]">(facultatif)</span>
            </div>

            <div
              className={[
                "rounded-2xl border border-dashed p-6 text-center transition",
                drag
                  ? "border-[color:var(--gold-border)] bg-[color:var(--gold-soft)]"
                  : "border-white/15 bg-black/10",
              ].join(" ")}
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDrag(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDrag(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDrag(false);
              }}
              onDrop={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                setDrag(false);
                if (e.dataTransfer.files?.length) await addFiles(e.dataTransfer.files);
              }}
            >
              <div className="text-sm font-semibold text-white">
                Sélectionnez ou glissez déposez vos images ici
              </div>
              <div className="text-xs text-[color:var(--muted)] mt-2">
                Taille maximale : {fmtBytes(MAX_IMG_BYTES)}
              </div>

              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="px-4 py-2 rounded-2xl border border-[color:var(--border)] bg-black/20 hover:bg-white/5 transition text-sm"
                >
                  📎 Choisir des images
                </button>

                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={async (e) => {
                    if (e.target.files?.length) await addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </div>

              {/* Previews */}
              {images.length > 0 ? (
                <div className="mt-5 grid grid-cols-2 md:grid-cols-3 gap-3">
                  {images.map((img) => (
                    <div
                      key={img.id}
                      className="relative rounded-2xl overflow-hidden border border-white/10 bg-black/20"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.dataUrl} alt={img.name} className="w-full h-28 object-cover" />
                      <button
                        type="button"
                        onClick={() => removeImg(img.id)}
                        className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/70 border border-white/10 text-white hover:bg-black transition"
                        title="Supprimer"
                      >
                        ✕
                      </button>
                      <div className="p-2 text-[10px] text-[color:var(--muted)] truncate">
                        {img.name} • {fmtBytes(img.size)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {/* Submit (FULL WIDTH + centered) */}
          <div className="mt-6 flex justify-center">
            <Button
              onClick={send}
              disabled={!canSend}
              className="w-full py-4 text-base font-semibold"
            >
              {sending ? "Envoi..." : "Rapporter un bug"}
            </Button>
          </div>

          {/* Info footer */}
          <div className="mt-6 rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4 text-sm text-blue-200">
            <div className="font-semibold">ℹ️ Nous reviendrons vers vous au plus vite.</div>
            <div className="mt-1 text-blue-100/80">
              Merci de détailler au mieux le rapport de bug. Veuillez inclure des photos si possible.
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
