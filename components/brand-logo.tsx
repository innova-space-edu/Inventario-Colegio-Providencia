"use client";

import { useState } from "react";
import styles from "./brand-logo.module.css";

export function BrandLogo({ variant = "shell" }: { variant?: "shell" | "login" }) {
  const [failed, setFailed] = useState(false);
  const wrapperClass = variant === "login" ? styles.loginLogo : styles.shellLogo;

  return (
    <div className={wrapperClass} aria-label="Colegio Providencia">
      {failed ? (
        <div className={styles.fallback} aria-hidden="true">CP</div>
      ) : (
        <img
          alt="Logo Colegio Providencia"
          className={styles.logo}
          onError={() => setFailed(true)}
          src="/colegio-logo.jpg"
        />
      )}
    </div>
  );
}
