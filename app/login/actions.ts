"use server";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";

export type LoginState = { error?: string };

export async function loginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Please enter your email and password." };
  const res = await signIn(email, password);
  if (res.error) return res;
  redirect("/");
}
