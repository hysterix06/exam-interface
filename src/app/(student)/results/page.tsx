import { redirect } from "next/navigation";

/** Results became part of Grades. */
export default function ResultsIndex() {
  redirect("/grades");
}
