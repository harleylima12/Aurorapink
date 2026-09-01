"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { EASE_OUT_EXPO } from "@/lib/motion";
import { uploadFoto } from "@/lib/upload-fotos";
import {
  createVeiculo,
  updateVeiculo,
  replaceFotos,
} from "@/app/admin/(dashboard)/actions";
import {
  CAMBIOS,
  COMBUSTIVEIS,
  emptyVeiculoForm,
  maskCurrency,
  maskInteger,
  onlyDigits,
  toVeiculoInput,
  validateVeiculo,
  type VeiculoFormErrors,
  type VeiculoFormValues,
} from "@/lib/veiculo-form";
import FotosUploader, { type FotoItem } from "./FotosUploader";
import type { VeiculoFoto } from "@/lib/types";

const inputBase =
  "w-full rounded-lg border bg-neutral-950 px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 transition-colors focus:outline-none focus:ring-1 disabled:opacity-60";

function inputClass(hasError?: boolean) {
  return `${inputBase} ${
    hasError
      ? "border-red-800 focus:border-red-600 focus:ring-red-600"
      : "border-neutral-700 focus:border-gold-500 focus:ring-gold-500"
  }`;
}

function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-white/50"
      >
        {label}
      </label>
      {children}
      <AnimatePresence mode="wait" initial={false}>
        {error ? (
          <motion.p
            key="erro"
            initial={{ opacity: 0, y: -4, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -4, height: 0 }}
            transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
            className="mt-1.5 overflow-hidden text-sm text-red-400"
          >
            {error}
          </motion.p>
        ) : hint ? (
          <p key="dica" className="mt-1.5 text-xs text-white/40">
            {hint}
          </p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 sm:p-8">
      <h2 className="font-display text-lg font-semibold text-white">{title}</h2>
      <p className="mt-1 text-sm text-white/50">{description}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export interface VeiculoFormProps {
  /** Present when editing; absent when creating from scratch. */
  veiculoId?: string;
  initialValues?: VeiculoFormValues;
  initialFotos?: VeiculoFoto[];
}

export default function VeiculoForm({
  veiculoId,
  initialValues,
  initialFotos = [],
}: VeiculoFormProps) {
  const router = useRouter();
  const isEdit = Boolean(veiculoId);

  const [values, setValues] = useState<VeiculoFormValues>(
    initialValues ?? emptyVeiculoForm
  );
  const [fotos, setFotos] = useState<FotoItem[]>(() =>
    initialFotos.map((foto, index) => ({
      uid: `saved-${index}-${foto.url}`,
      url: foto.url,
      categoria: foto.categoria ?? "",
    }))
  );
  const [errors, setErrors] = useState<VeiculoFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [uploadFailures, setUploadFailures] = useState<string[]>([]);

  // Once a create succeeds, the vehicle exists — a retry after a partial
  // photo failure must update it instead of inserting a duplicate.
  const savedIdRef = useRef<string | undefined>(veiculoId);

  // Object URLs for previews are only freed on unmount; removing a photo
  // revokes its own URL inside the uploader.
  const fotosRef = useRef(fotos);
  fotosRef.current = fotos;
  useEffect(() => {
    return () => {
      fotosRef.current.forEach((foto) => {
        if (foto.file) URL.revokeObjectURL(foto.url);
      });
    };
  }, []);

  const setField = <K extends keyof VeiculoFormValues>(
    key: K,
    value: VeiculoFormValues[K]
  ) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (errors[key as keyof VeiculoFormErrors]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  const handleFotosChange = (novas: FotoItem[]) => {
    setFotos(novas);
    if (errors.fotos) setErrors((prev) => ({ ...prev, fotos: undefined }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setUploadFailures([]);

    const validation = validateVeiculo(values, fotos.length);
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      // Bring the first problem into view rather than leaving the user
      // staring at an unchanged form after pressing Save.
      document
        .querySelector("[data-field-error='true']")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setErrors({});
    setSaving(true);

    try {
      const payload = toVeiculoInput(values);

      // 1. Save the vehicle row (or update it on a retry / edit).
      let id = savedIdRef.current;
      const result = id
        ? await updateVeiculo(id, payload)
        : await createVeiculo(payload);

      if (result.error || !result.id) {
        setFormError(result.error ?? "Não foi possível salvar o veículo.");
        setSaving(false);
        return;
      }

      id = result.id;
      savedIdRef.current = id;

      // 2. Upload the photos that aren't in Storage yet, one at a time so
      //    the progress counter stays meaningful with many files.
      const pendentes = fotos.filter((foto) => foto.file);
      const falhas: string[] = [];
      const enviadas = new Map<string, string>();

      if (pendentes.length > 0) {
        setProgress({ done: 0, total: pendentes.length });

        for (let index = 0; index < pendentes.length; index += 1) {
          const foto = pendentes[index];
          const { url, error } = await uploadFoto(id, foto.file!);
          if (url) {
            enviadas.set(foto.uid, url);
          } else {
            falhas.push(`${foto.file!.name}: ${error ?? "falha no envio"}`);
          }
          setProgress({ done: index + 1, total: pendentes.length });
        }
      }

      // 3. Keep the chosen order, dropping whatever failed to upload.
      const ordenadas = fotos
        .map((foto) => {
          const url = foto.file ? enviadas.get(foto.uid) : foto.url;
          return url ? { url, categoria: foto.categoria } : null;
        })
        .filter((foto): foto is { url: string; categoria: string } =>
          Boolean(foto)
        );

      if (ordenadas.length === 0) {
        setFormError(
          "Nenhuma foto pôde ser enviada. O veículo foi salvo — tente enviar as fotos novamente."
        );
        setUploadFailures(falhas);
        setProgress(null);
        setSaving(false);
        return;
      }

      const fotosResult = await replaceFotos(id, ordenadas);
      if (fotosResult.error) {
        setFormError(`Erro ao salvar as fotos: ${fotosResult.error}`);
        setProgress(null);
        setSaving(false);
        return;
      }

      // Some uploads failed: stay put so the user can retry just those,
      // with the successful ones already promoted to saved photos.
      if (falhas.length > 0) {
        setFotos((prev) =>
          prev
            .map((foto) => {
              const url = foto.file ? enviadas.get(foto.uid) : foto.url;
              if (!url) return foto;
              if (foto.file) URL.revokeObjectURL(foto.url);
              return { uid: foto.uid, url, categoria: foto.categoria };
            })
            .filter((foto) => !foto.file || !enviadas.has(foto.uid))
        );
        setFormError(
          "O veículo foi salvo, mas algumas fotos não puderam ser enviadas."
        );
        setUploadFailures(falhas);
        setProgress(null);
        setSaving(false);
        return;
      }

      router.push(`/admin?ok=${isEdit ? "editado" : "criado"}`);
      router.refresh();
    } catch (err) {
      console.error("Erro ao salvar veículo:", err);
      setFormError(
        err instanceof Error
          ? err.message
          : "Erro inesperado ao salvar o veículo."
      );
      setProgress(null);
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Section
        title="Dados do veículo"
        description="Informações que aparecem na vitrine e na página do anúncio."
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div data-field-error={Boolean(errors.marca)}>
            <Field label="Marca *" htmlFor="marca" error={errors.marca}>
              <input
                id="marca"
                value={values.marca}
                onChange={(e) => setField("marca", e.target.value)}
                disabled={saving}
                placeholder="Chevrolet"
                className={inputClass(Boolean(errors.marca))}
              />
            </Field>
          </div>

          <div data-field-error={Boolean(errors.modelo)}>
            <Field label="Modelo *" htmlFor="modelo" error={errors.modelo}>
              <input
                id="modelo"
                value={values.modelo}
                onChange={(e) => setField("modelo", e.target.value)}
                disabled={saving}
                placeholder="Onix 1.0 Turbo LT"
                className={inputClass(Boolean(errors.modelo))}
              />
            </Field>
          </div>

          <div data-field-error={Boolean(errors.ano)}>
            <Field label="Ano *" htmlFor="ano" error={errors.ano}>
              <input
                id="ano"
                inputMode="numeric"
                value={values.ano}
                onChange={(e) => setField("ano", onlyDigits(e.target.value, 4))}
                disabled={saving}
                placeholder="2022"
                className={inputClass(Boolean(errors.ano))}
              />
            </Field>
          </div>

          <Field label="Km" htmlFor="km" hint="Quilometragem atual do veículo.">
            <input
              id="km"
              inputMode="numeric"
              value={values.km}
              onChange={(e) => setField("km", maskInteger(e.target.value))}
              disabled={saving}
              placeholder="32.000"
              className={inputClass()}
            />
          </Field>

          <div data-field-error={Boolean(errors.preco)}>
            <Field label="Preço *" htmlFor="preco" error={errors.preco}>
              <input
                id="preco"
                inputMode="numeric"
                value={values.preco}
                onChange={(e) => setField("preco", maskCurrency(e.target.value))}
                disabled={saving}
                placeholder="R$ 79.900,00"
                className={inputClass(Boolean(errors.preco))}
              />
            </Field>
          </div>

          <Field label="Cor" htmlFor="cor">
            <input
              id="cor"
              value={values.cor}
              onChange={(e) => setField("cor", e.target.value)}
              disabled={saving}
              placeholder="Branco"
              className={inputClass()}
            />
          </Field>

          <Field label="Combustível" htmlFor="combustivel">
            <select
              id="combustivel"
              value={values.combustivel}
              onChange={(e) => setField("combustivel", e.target.value)}
              disabled={saving}
              className={inputClass()}
            >
              {COMBUSTIVEIS.map((opcao) => (
                <option key={opcao} value={opcao}>
                  {opcao}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Câmbio" htmlFor="cambio">
            <select
              id="cambio"
              value={values.cambio}
              onChange={(e) => setField("cambio", e.target.value)}
              disabled={saving}
              className={inputClass()}
            >
              {CAMBIOS.map((opcao) => (
                <option key={opcao} value={opcao}>
                  {opcao}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="mt-5">
          <Field label="Descrição" htmlFor="descricao">
            <textarea
              id="descricao"
              rows={4}
              value={values.descricao}
              onChange={(e) => setField("descricao", e.target.value)}
              disabled={saving}
              placeholder="Único dono, revisões em dia, pneus novos..."
              className={`${inputClass()} resize-y`}
            />
          </Field>
        </div>

        <label
          className={`mt-6 flex items-start gap-3 rounded-xl border p-4 transition-colors ${
            values.destaque
              ? "border-gold-500/40 bg-gold-500/5"
              : "border-neutral-800 bg-neutral-950"
          } ${saving ? "opacity-60" : "cursor-pointer"}`}
        >
          <input
            type="checkbox"
            checked={values.destaque}
            onChange={(e) => setField("destaque", e.target.checked)}
            disabled={saving}
            className="mt-0.5 h-4 w-4 flex-shrink-0 accent-gold-500"
          />
          <span>
            <span className="block text-sm font-medium text-white">
              Destaque da semana
            </span>
            <span className="mt-0.5 block text-xs text-white/50">
              Veículos em destaque ganham posição de vitrine na página
              inicial.
            </span>
          </span>
        </label>
      </Section>

      <Section
        title="Fotos"
        description="A primeira foto vira a capa do anúncio. Arraste para mudar a ordem."
      >
        <div data-field-error={Boolean(errors.fotos)}>
          <FotosUploader
            fotos={fotos}
            onChange={handleFotosChange}
            disabled={saving}
            error={errors.fotos}
          />
        </div>
      </Section>

      {formError && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/40 px-4 py-3">
          <p className="text-sm text-red-300">{formError}</p>
          {uploadFailures.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-red-400/80">
              {uploadFailures.map((falha) => (
                <li key={falha}>• {falha}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {saving && progress && (
          <p className="mr-auto text-sm text-white/60">
            Enviando foto {progress.done} de {progress.total}...
          </p>
        )}

        <Link
          href="/admin"
          className={`rounded-full border border-neutral-700 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 ${
            saving ? "pointer-events-none opacity-50" : ""
          }`}
        >
          Cancelar
        </Link>

        <motion.button
          type="submit"
          disabled={saving}
          whileHover={saving ? undefined : { scale: 1.02 }}
          whileTap={saving ? undefined : { scale: 0.98 }}
          transition={{ duration: 0.15, ease: EASE_OUT_EXPO }}
          className="flex items-center justify-center gap-2 rounded-full bg-gold-500 px-6 py-2.5 text-sm font-semibold text-neutral-950 transition-colors hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving && (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-950/30 border-t-neutral-950" />
          )}
          {saving
            ? "Salvando..."
            : isEdit
              ? "Salvar alterações"
              : "Cadastrar veículo"}
        </motion.button>
      </div>
    </form>
  );
}
