import { useState } from "react";
import { Link } from "@/lib/router-compat";
import { z } from "zod";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Check, Copy, Github, Loader2, Mail } from "lucide-react";
import { BlueskyIcon, MastodonIcon } from "@/components/SocialIcons";
import { cn } from "@/lib/utils";

export const CONTACT_EMAIL = "contact@rout.be";
import { SOCIAL_LINKS, EXTERNAL_LINK_PROPS } from "@/lib/social-links";

const GITHUB_ISSUES = SOCIAL_LINKS.github;

const TOPICS = [
  { id: "general", label: "General", subject: "General inquiry" },
  { id: "bug", label: "Bug & Tech", subject: "Bug report / technical" },
  { id: "enterprise", label: "Enterprise", subject: "Enterprise & custom domains" },
] as const;

type TopicId = (typeof TOPICS)[number]["id"];

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  subject: z.string().trim().min(1).max(150),
  message: z.string().trim().min(1).max(2000),
});

const inputClass =
  "w-full bg-background border border-input rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all";
const labelClass =
  "text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 block";
const rowClass =
  "flex items-center justify-between gap-3 p-4 bg-muted/40 rounded-xl border border-border/50";

export default function Contact() {
  const [topic, setTopic] = useState<TopicId>("general");
  const [form, setForm] = useState<{ name: string; email: string; message: string }>({
    name: "",
    email: "",
    message: "",
  });
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);

  const field = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const currentSubject = TOPICS.find((t) => t.id === topic)?.subject ?? TOPICS[0].subject;

  const copyEmail = async () => {
    await navigator.clipboard.writeText(CONTACT_EMAIL);
    setCopied(true);
    toast.success("Email address copied");
    window.setTimeout(() => setCopied(false), 1600);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ ...form, subject: currentSubject });
    if (!parsed.success) {
      toast.error("Please fill in all fields correctly.");
      return;
    }
    setSending(true);
    const { name, email, subject, message } = parsed.data;
    const body = `${message}\n\n— ${name} (${email})`;
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;
    window.setTimeout(() => {
      setSending(false);
      toast.success("Your mail client opened — send the message to finish.");
    }, 700);
  };

  return (
    <AppLayout crumbs={[{ label: "Contact" }]}>
      <div className="px-4 py-8 sm:py-14">
        <header className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">Get in touch</span>
          <h1 className="mt-2 font-serif text-4xl font-medium sm:text-5xl">
            Contact &amp; Support
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
            Questions, bug reports, custom infrastructure, or partnerships — we read every message.
          </p>
        </header>

        <div
          data-testid="contact-topics"
          role="tablist"
          aria-label="Contact topic"
          className="mx-auto mt-8 grid w-full max-w-xl grid-cols-3 gap-1 rounded-xl bg-muted p-1"
        >
          {TOPICS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={topic === t.id}
              onClick={() => setTopic(t.id)}
              className={cn(
                "rounded-lg py-2 text-xs font-medium transition-all md:text-sm",
                topic === t.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {topic === "bug" && (
          <p className="mt-3 text-center text-sm text-muted-foreground">
            Technical issue? Open a{" "}
            <a
              href={GITHUB_ISSUES}
              {...EXTERNAL_LINK_PROPS}
              className="text-foreground underline underline-offset-4"
            >
              GitHub issue
            </a>{" "}
            directly.
          </p>
        )}

        <div className="mx-auto mt-8 max-w-xl space-y-5 rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
          <form onSubmit={submit} className="space-y-5">
            <div>
              <label htmlFor="c-name" className={labelClass}>
                Name
              </label>
              <input
                id="c-name"
                placeholder="Your name"
                className={inputClass}
                maxLength={100}
                value={form.name}
                onChange={(e) => field("name", e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="c-email" className={labelClass}>
                Email address
              </label>
              <input
                id="c-email"
                type="email"
                placeholder="you@domain.com"
                className={inputClass}
                maxLength={255}
                value={form.email}
                onChange={(e) => field("email", e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="c-message" className={labelClass}>
                Message
              </label>
              <textarea
                id="c-message"
                placeholder="How can we help?"
                className={cn(inputClass, "min-h-36 resize-y")}
                maxLength={2000}
                value={form.message}
                onChange={(e) => field("message", e.target.value)}
              />
            </div>
            <button
              type="submit"
              disabled={sending}
              className="flex w-full items-center justify-center rounded-xl bg-primary py-3 font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {sending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…
                </>
              ) : (
                "Send message"
              )}
            </button>
          </form>
        </div>

        <section
          data-testid="direct-channels"
          className="mx-auto mt-6 max-w-xl space-y-2"
          aria-labelledby="direct-channels-heading"
        >
          <h2
            id="direct-channels-heading"
            className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Direct channels
          </h2>

          <div className={rowClass}>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="flex min-w-0 items-center gap-2 text-sm text-foreground"
            >
              <Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate">{CONTACT_EMAIL}</span>
            </a>
            <button
              type="button"
              onClick={copyEmail}
              aria-label="Copy e-mail address"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/60 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>

          <a href={GITHUB_ISSUES} {...EXTERNAL_LINK_PROPS} className={rowClass}>
            <span className="flex items-center gap-2 text-sm text-foreground">
              <Github className="h-4 w-4 text-muted-foreground" aria-hidden /> github.com/routbe
            </span>
            <span className="text-xs text-muted-foreground">Issues</span>
          </a>

          <a href={SOCIAL_LINKS.bluesky} {...EXTERNAL_LINK_PROPS} className={rowClass}>
            <span className="flex items-center gap-2 text-sm text-foreground">
              <BlueskyIcon className="h-4 w-4" /> bsky.app/profile/rout.be
            </span>
            <span className="text-xs text-muted-foreground">Bluesky</span>
          </a>

          <a href={SOCIAL_LINKS.mastodon} {...EXTERNAL_LINK_PROPS} className={rowClass}>
            <span className="flex items-center gap-2 text-sm text-foreground">
              <MastodonIcon className="h-4 w-4" /> mastodon.social/@routbe
            </span>
            <span className="text-xs text-muted-foreground">Fediverse</span>
          </a>

          <div className={rowClass}>
            <p className="text-xs text-muted-foreground">
              Data request?{" "}
              <Link to="/privacy" className="underline underline-offset-4 hover:text-foreground">
                View our privacy policy
              </Link>
              .
            </p>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
