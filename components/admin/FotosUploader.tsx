"use client";

import { useRef, useState, type DragEvent } from "react";
import Image from "next/image";
import { Reorder } from "framer-motion";
import { CloseIcon, DragIcon, PhotoIcon } from "@/components/icons";
import { CATEGORIAS_FOTO } from "@/lib/veiculo-form";

export interface FotoItem {
  /** Stable key for React/Reorder — not the database id. */
  uid: string;
  /** Public URL (already saved) or an object URL preview (new file). */
  url: string;
  /** Label shown on the public page; empty means "no label". */
  categoria: string;
  /** Only present while the photo still needs uploading. */
  file?: File;
}

export function makeFotoItem(file: File): FotoItem {
  return {
    uid: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    url: URL.createObjectURL(file),
    categoria: "",
    file,
  };
}

const ACCEPTED = "image/*";

export default function FotosUploader({
  fotos,
  onChange,
  disabled,
  error,
}: {
  fotos: FotoItem[];
  onChange: (fotos: FotoItem[]) => void;
  disabled?: boolean;
  error?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const addFiles = (fileList: FileList | null) => {
    if (!fileList || disabled) return;
    const novas = Array.from(fileList)
      .filter((file) => file.type.startsWith("image/"))
      .map(makeFotoItem);
    if (novas.length > 0) onChange([...fotos, ...novas]);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    addFiles(event.dataTransfer.files);
  };

  const removeFoto = (uid: string) => {
    const alvo = fotos.find((foto) => foto.uid === uid);
    // Only object URLs need revoking; a saved photo's URL is a real one.
    if (alvo?.file) URL.revokeObjectURL(alvo.url);
    onChange(fotos.filter((foto) => foto.uid !== uid));
  };

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (!disabled) inputRef.current?.click();
          }
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-10 text-center transition-colors ${
          dragOver
            ? "border-gold-500 bg-gold-500/5"
            : error
              ? "border-red-800 bg-neutral-950"
              : "border-neutral-700 bg-neutral-950 hover:border-neutral-600"
        } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
      >
        <PhotoIcon className="h-8 w-8 text-white/30" />
        <p className="mt-3 text-sm font-medium text-white">
          Arraste as fotos aqui
        </p>
        <p className="mt-1 text-xs text-white/50">
          ou clique para selecionar do computador
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          multiple
          disabled={disabled}
          onChange={(event) => {
            addFiles(event.target.files);
            // Reset so picking the same file twice still fires onChange.
            event.target.value = "";
          }}
          className="hidden"
        />
      </div>

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

      {fotos.length > 0 && (
        <>
          <p className="mt-5 text-xs text-white/50">
            {fotos.length} {fotos.length === 1 ? "foto" : "fotos"} · arraste
            para reordenar — a primeira é a capa do anúncio.
          </p>

          <Reorder.Group
            axis="y"
            values={fotos}
            onReorder={onChange}
            className="mt-3 space-y-2"
          >
            {fotos.map((foto, index) => (
              <Reorder.Item
                key={foto.uid}
                value={foto}
                dragListener={!disabled}
                className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-neutral-800 bg-neutral-900 p-2 ${
                  disabled ? "" : "cursor-grab active:cursor-grabbing"
                }`}
              >
                <DragIcon className="h-4 w-4 flex-shrink-0 text-white/30" />

                <div className="relative h-14 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-neutral-800">
                  <Image
                    src={foto.url}
                    alt=""
                    fill
                    sizes="80px"
                    className="object-cover"
                    // Without this the browser's native image drag hijacks
                    // the pointer and the row never reorders.
                    draggable={false}
                    // Object URLs can't go through the optimizer.
                    unoptimized={Boolean(foto.file)}
                  />
                </div>

                <div className="min-w-[6rem] flex-1">
                  <p className="truncate text-sm text-white">
                    {index === 0 ? "Capa" : `Foto ${index + 1}`}
                  </p>
                  <p className="truncate text-xs text-white/40">
                    {foto.file ? foto.file.name : "Já enviada"}
                  </p>
                </div>

                <div className="ml-auto flex flex-shrink-0 items-center gap-1">
                <select
                  value={foto.categoria}
                  disabled={disabled}
                  aria-label={`Categoria da foto ${index + 1}`}
                  // The select lives inside a draggable row: without this
                  // the drag gesture swallows the click that opens it.
                  onPointerDownCapture={(event) => event.stopPropagation()}
                  onChange={(event) =>
                    onChange(
                      fotos.map((item) =>
                        item.uid === foto.uid
                          ? { ...item, categoria: event.target.value }
                          : item
                      )
                    )
                  }
                  className="w-32 rounded-lg border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-white transition-colors focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500 disabled:opacity-60"
                >
                  <option value="">Sem categoria</option>
                  {CATEGORIAS_FOTO.map((opcao) => (
                    <option key={opcao} value={opcao}>
                      {opcao}
                    </option>
                  ))}
                  {/* An existing free-text value typed outside the form
                      would vanish from a select that doesn't list it. */}
                  {foto.categoria &&
                    !CATEGORIAS_FOTO.includes(
                      foto.categoria as (typeof CATEGORIAS_FOTO)[number]
                    ) && (
                      <option value={foto.categoria}>{foto.categoria}</option>
                    )}
                </select>

                <button
                  type="button"
                  onClick={() => removeFoto(foto.uid)}
                  disabled={disabled}
                  aria-label={`Remover foto ${index + 1}`}
                  className="flex-shrink-0 rounded-lg p-2 text-white/50 transition-colors hover:bg-red-950 hover:text-red-400 disabled:opacity-40"
                >
                  <CloseIcon className="h-4 w-4" />
                </button>
                </div>
              </Reorder.Item>
            ))}
          </Reorder.Group>
        </>
      )}
    </div>
  );
}
