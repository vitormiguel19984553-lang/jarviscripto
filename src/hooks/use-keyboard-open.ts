import { useEffect, useState } from "react";

/**
 * Deteta o teclado virtual (iOS/Android) através do `visualViewport`.
 * `offset` é a altura ocupada pelo teclado no fundo do ecrã.
 */
export function useKeyboardOpen() {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const hidden = window.innerHeight - vv.height - vv.offsetTop;
      setOffset(hidden > 120 ? hidden : 0);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return { open: offset > 0, offset };
}
