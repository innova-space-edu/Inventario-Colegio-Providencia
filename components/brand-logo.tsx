"use client";

import { useState } from "react";
import styles from "./brand-logo.module.css";

const LOGO_SRC = "/colegio-logo.jpg?v=20260820-0917";

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
          draggable={false}
          onError={() => setFailed(true)}
          src={LOGO_SRC}
        />
      )}
    </div>
  );
}
