import type { ComponentType } from "react";

export interface EditorProps<TDef> {
  def: TDef;
  onChange: (def: TDef) => void;
}

export interface RendererProps<TInstance, TResponse> {
  /** The redacted instance: exactly what a student receives. */
  instance: TInstance;
  value: TResponse | null;
  onChange?: (value: TResponse) => void;
  /** Show the value without letting it change (answer key, review). */
  readOnly?: boolean;
}

/** The UI half of a question-type plugin; the pure half is core.ts. */
export interface QuestionTypeUi<TDef, TInstance, TResponse> {
  id: string;
  /** One line shown when picking a type. */
  description: string;
  /** A blank, valid-shaped definition for "New question". */
  newDef(): TDef;
  Editor: ComponentType<EditorProps<TDef>>;
  Renderer: ComponentType<RendererProps<TInstance, TResponse>>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyQuestionTypeUi = QuestionTypeUi<any, any, any>;
