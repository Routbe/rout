/**
 * DNS lookups for custom-domain verification.
 *
 * Runs on the edge runtime, so we use Cloudflare's DNS-over-HTTPS resolver
 * instead of node:dns (which is not available there).
 */

const DOH = "https://cloudflare-dns.com/dns-query";

interface DohAnswer {
  name: string;
  type: number;
  data: string;
}

async function query(name: string, type: "TXT" | "CNAME" | "A"): Promise<string[]> {
  const res = await fetch(`${DOH}?name=${encodeURIComponent(name)}&type=${type}`, {
    headers: { accept: "application/dns-json" },
  });
  if (!res.ok) throw new Error(`DNS lookup failed (${res.status})`);
  const body = (await res.json()) as { Answer?: DohAnswer[] };
  return (body.Answer ?? []).map((a) => a.data.replace(/^"|"$/g, "").trim());
}

export interface DnsCheck {
  txtFound: boolean;
  cnameFound: boolean;
  txtRecords: string[];
  targetRecords: string[];
}

/**
 * A domain counts as verified when the ownership TXT record is present AND the
 * host points at our edge (CNAME or A record).
 */
export async function checkDomainDns(
  domain: string,
  token: string,
  cnameTarget: string,
  aTarget: string,
): Promise<DnsCheck> {
  const [txt, cname, a] = await Promise.all([
    query(`_rout.${domain}`, "TXT").catch(() => [] as string[]),
    query(domain, "CNAME").catch(() => [] as string[]),
    query(domain, "A").catch(() => [] as string[]),
  ]);

  const normalize = (v: string) => v.replace(/\.$/, "").toLowerCase();
  const targetRecords = [...cname, ...a];

  return {
    txtFound: txt.some((v) => v === token || v === `rout-verify=${token}`),
    cnameFound:
      cname.some((v) => normalize(v) === normalize(cnameTarget)) || a.some((v) => v === aTarget),
    txtRecords: txt,
    targetRecords,
  };
}
