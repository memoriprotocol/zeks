"use client"

/**
 * ZEKS Loop — F13 amount inputs.
 *
 * Two controlled inputs that drive the carry calculation and the
 * four-leg transaction orchestration:
 *
 *   - `collateralAmount` (in stock-token units, e.g. "10" for 10 AAPL tokens)
 *   - `loanAmount`        (in loan-token units, e.g. "500" for 500 USDG)
 *
 * Pure presentational. No transactions. No wallet. The parent
 * (`loop-composition.tsx`) owns the state and passes `onChange`
 * callbacks.
 *
 * The parent computes `carry` and `risk` from these inputs using
 * the EXISTING `computeNetCarry` and `assessLoopRisk` helpers in
 * `lib/markets/loop/types.ts`. F13 does NOT introduce new
 * calculations — it only wires inputs to the existing pure functions.
 */

import * as React from "react"

export interface LoopAmountInputsValues {
  collateralAmount: string
  loanAmount: string
}

export interface LoopAmountInputsProps {
  values: LoopAmountInputsValues
  onChange: (next: LoopAmountInputsValues) => void
  /** Stock-token symbol (e.g. "AAPL") — used as the unit label. */
  collateralSymbol: string
  /** Stablecoin symbol (e.g. "USDG") — used as the unit label. */
  loanSymbol: string
  /** Disable both inputs (e.g. when no market is selected). */
  disabled?: boolean
}

export function LoopAmountInputs({
  values,
  onChange,
  collateralSymbol,
  loanSymbol,
  disabled,
}: LoopAmountInputsProps) {
  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
        columnGap: "12px",
        rowGap: "10px",
      }}
      data-loop-amount-inputs
    >
      <AmountField
        label="Collateral"
        unit={collateralSymbol}
        value={values.collateralAmount}
        onChange={(v) => onChange({ ...values, collateralAmount: v })}
        disabled={disabled}
        testId="loop-amount-collateral"
      />
      <AmountField
        label="Borrow"
        unit={loanSymbol}
        value={values.loanAmount}
        onChange={(v) => onChange({ ...values, loanAmount: v })}
        disabled={disabled}
        testId="loop-amount-loan"
      />
    </div>
  )
}

function AmountField({
  label,
  unit,
  value,
  onChange,
  disabled,
  testId,
}: {
  label: string
  unit: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  testId: string
}) {
  return (
    <label
      className="flex flex-col"
      style={{ gap: "4px", minWidth: 0 }}
      data-loop-amount-field={testId}
    >
      <span
        className="zeks-eyebrow uppercase"
        style={{
          fontSize: "var(--font-micro)",
          color: "var(--muted-foreground)",
          letterSpacing: "0.08em",
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      <div
        className="flex items-center"
        style={{
          height: "34px",
          padding: "0 10px",
          border: "1px solid var(--border)",
          borderRadius: "6px",
          backgroundColor: "var(--background)",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="0"
          aria-label={`${label} amount`}
          data-testid={testId}
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "13px",
            color: "var(--foreground)",
            background: "transparent",
            border: "none",
            outline: "none",
            flex: 1,
            minWidth: 0,
          }}
        />
        <span
          className="zeks-eyebrow uppercase"
          style={{
            fontSize: "10px",
            color: "var(--muted-foreground)",
            letterSpacing: "0.06em",
            marginLeft: "8px",
            flexShrink: 0,
          }}
        >
          {unit}
        </span>
      </div>
    </label>
  )
}
