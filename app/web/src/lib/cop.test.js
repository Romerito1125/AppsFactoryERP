import { describe, expect, test } from "bun:test";

import {
  caretFromDigitCount,
  formatCop,
  formatCopDraft,
  groupThousands,
  readCopInput,
} from "./cop.js";

describe("formato de pesos", () => {
  test("agrupa miles con punto", () => {
    expect(groupThousands("1234567")).toBe("1.234.567");
    expect(groupThousands("999")).toBe("999");
    expect(groupThousands("1000")).toBe("1.000");
  });

  test("muestra COP con símbolo y sin centavos", () => {
    expect(formatCop(1234567)).toBe("$ 1.234.567");
    expect(formatCop(4165.4)).toBe("$ 4.165");
    expect(formatCop(0)).toBe("$ 0");
    expect(formatCop(-5000)).toBe("-$ 5.000");
  });

  test("el borrador de input no lleva símbolo y vacío queda vacío", () => {
    expect(formatCopDraft(1234567)).toBe("1.234.567");
    expect(formatCopDraft(0)).toBe("");
    expect(formatCopDraft(undefined)).toBe("");
  });
});

describe("lectura de lo escrito o pegado", () => {
  test("ignora los puntos de miles", () => {
    expect(readCopInput("1.234.567").value).toBe(1234567);
    expect(readCopInput("1.500").value).toBe(1500);
  });

  test("pegar con símbolo y decimales en cero se limpia", () => {
    const pasted = readCopInput("$ 1.234.567,00", { strict: true });
    expect(pasted.value).toBe(1234567);
    expect(pasted.hasDecimals).toBe(false);
    expect(readCopInput("1234567.0", { strict: true }).value).toBe(1234567);
  });

  test("centavos distintos de cero se rechazan al pegar (modo estricto)", () => {
    expect(readCopInput("1,5", { strict: true }).hasDecimals).toBe(true);
    expect(readCopInput("1.234.567,50", { strict: true }).hasDecimals).toBe(true);
    expect(readCopInput("12.34", { strict: true }).hasDecimals).toBe(true);
  });

  test("al escribir o borrar, un punto de miles incompleto no es centavos", () => {
    const deleted = readCopInput("1.234.56");
    expect(deleted.hasDecimals).toBe(false);
    expect(deleted.value).toBe(123456);
    expect(readCopInput("1.234.567").value).toBe(1234567);
  });

  test("tres cifras tras el separador son miles, no decimales", () => {
    const read = readCopInput("1.500");
    expect(read.hasDecimals).toBe(false);
    expect(read.value).toBe(1500);
  });

  test("quita ceros a la izquierda y limita a 12 dígitos", () => {
    expect(readCopInput("000123").value).toBe(123);
    expect(readCopInput("1234567890123456").digits.length).toBe(12);
  });

  test("texto vacío o sin cifras vale cero", () => {
    expect(readCopInput("").value).toBe(0);
    expect(readCopInput("$ ").value).toBe(0);
  });

  test("el negativo solo existe si se permite; si no, el signo se ignora", () => {
    expect(readCopInput("-500").value).toBe(500);
    expect(readCopInput("-500", { allowNegative: true }).value).toBe(-500);
  });
});

describe("posición del cursor al formatear", () => {
  test("el cursor queda después del dígito escrito", () => {
    expect(caretFromDigitCount("1.234", 1)).toBe(1);
    expect(caretFromDigitCount("1.234", 2)).toBe(3);
    expect(caretFromDigitCount("1.234", 4)).toBe(5);
    expect(caretFromDigitCount("1.234", 0)).toBe(0);
  });
});
