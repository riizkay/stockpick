import { z } from 'zod';
import { EMITTEN_PROFILE_URL_BASE } from '../shared/config.js';
import { BROWSERISH_GET_HEADERS } from '../shared/http.js';
import { resolveToken } from '../shared/token.js';

function buildProfileUrl(ticker) {
  const base = EMITTEN_PROFILE_URL_BASE.replace(/\/$/, '');
  return `${base}/${encodeURIComponent(ticker)}/profile`;
}

function compactKeyExecutive(ke) {
  if (!ke || typeof ke !== 'object') return null;
  const out = {};
  for (const [role, arr] of Object.entries(ke)) {
    if (!Array.isArray(arr) || arr.length === 0) continue;
    const names = arr.map((x) => x?.value).filter(Boolean);
    if (names.length) out[role] = names;
  }
  return Object.keys(out).length ? out : null;
}

function compactSecretary(list) {
  if (!Array.isArray(list)) return null;
  return list.map((s) => {
    let v = s?.value;
    if (typeof v === 'string' && v.trim().startsWith('{')) {
      try {
        v = JSON.parse(v);
      } catch {
        // keep string
      }
    }
    return { lu: s?.lastupdate ?? null, v };
  });
}

function buildCompactPayload(parsed) {
  const d = parsed && typeof parsed === 'object' ? parsed.data : null;
  if (!d || typeof d !== 'object') {
    return {
      message: parsed?.message,
      rawShape: 'unknown',
      note: 'tidak ada parsed.data',
    };
  }

  const addr0 =
    Array.isArray(d.address) && d.address.length ? d.address[0] : null;
  const addr = addr0
    ? {
        office: addr0.office ?? null,
        phone: addr0.phone ?? null,
        website: addr0.website ?? null,
        email: Array.isArray(addr0.email) ? addr0.email : null,
      }
    : null;

  const sh = Array.isArray(d.shareholder)
    ? d.shareholder.map((x) => ({
        n: x?.name ?? null,
        p: x?.percentage ?? null,
        v: x?.value ?? null,
        b: Array.isArray(x?.badges) ? x.badges : [],
      }))
    : [];

  const shOne = d.shareholder_one_percent;
  const sh1p =
    shOne && typeof shOne === 'object'
      ? {
          lu: shOne.last_updated ?? null,
          sh: Array.isArray(shOne.shareholder)
            ? shOne.shareholder.map((x) => ({
                n: x?.name ?? null,
                p: x?.percentage ?? null,
                vf: x?.value_formatted ?? x?.value ?? null,
              }))
            : [],
        }
      : null;

  return {
    message: parsed.message,
    bg: d.background ?? null,
    hist: d.history ?? null,
    addr,
    exec: compactKeyExecutive(d.key_executive),
    sec: compactSecretary(d.secretary),
    sh,
    sh1p,
    sub: Array.isArray(d.subsidiary) ? d.subsidiary : [],
    shn: Array.isArray(d.shareholder_numbers)
      ? d.shareholder_numbers.slice(0, 12)
      : [],
    badges: Array.isArray(d.badges) ? d.badges : [],
    shDirCom: Array.isArray(d.shareholder_director_commissioner)
      ? d.shareholder_director_commissioner.map((x) => ({
          n: x?.name ?? null,
          p: x?.percentage ?? null,
          b: Array.isArray(x?.badges) ? x.badges : [],
        }))
      : [],
    list: d.listing_information ?? null,
    bene: Array.isArray(d.beneficiary) ? d.beneficiary : [],
    prof: d.profile ?? null,
    note:
      'ringkas: bg, hist, addr, exec, sec, sh, sh1p (pemegang >1%), sub, shn, shDirCom, list, bene, prof. lihat field note di schema tool untuk detail kunci. compact=false untuk body penuh.',
  };
}

export function registerStockbitGetProfile(mcpServer) {
  mcpServer.registerTool(
    'stockbit_get_profile',
    {
      description: `GET profil emiten Stockbit (GET .../emitten/{ticker}/profile): alamat, background, sejarah IPO, jajaran direksi/komisaris, pemegang saham, anak usaha, beneficiary, listing_information, dll.

compact=true: struktur dipadatkan (kunci singkat, potong sebagian shareholder_numbers). compact=false: body API penuh di field body.`,
      inputSchema: {
        ticker: z
          .string()
          .describe(
            'Kode saham Indonesia, mis. BBCA, IPCM (dinormalisasi ke huruf besar).'
          ),
        compact: z
          .boolean()
          .optional()
          .describe(
            'true: keluaran ringkas hemat token. false: respons JSON API utuh di field body.'
          ),
        stockbit_token: z
          .string()
          .optional()
          .describe(
            'Opsional. Override token; kosongkan untuk STOCKBIT_TOKEN dari env MCP.'
          ),
      },
    },
    async ({ ticker, compact, stockbit_token: tokenOverride }) => {
      const code = String(ticker ?? '')
        .trim()
        .toUpperCase();
      if (!code) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { error: 'ticker wajib diisi (kode saham).' },
                null,
                2
              ),
            },
          ],
        };
      }

      const token = resolveToken(tokenOverride);
      if (!token) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error:
                    'Token tidak ada. Set STOCKBIT_TOKEN pada konfigurasi MCP server (env).',
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const useCompact = compact === true;
      const url = buildProfileUrl(code);

      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            ...BROWSERISH_GET_HEADERS,
            Authorization: `Bearer ${token}`,
          },
        });

        const raw = await res.text();
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = raw;
        }

        const baseMetaURL = {
          url,
          ticker: code,
          status: res.status,
          ok: res.ok,
        };

        const payload = useCompact
          ? {
              ...baseMetaURL,
              compact: true,
              ...buildCompactPayload(parsed),
            }
          : {
              ...baseMetaURL,
              body: parsed,
            };

        const text = useCompact
          ? JSON.stringify(payload)
          : JSON.stringify(payload, null, 2);

        return {
          isError: !res.ok,
          content: [
            {
              type: 'text',
              text,
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: err instanceof Error ? err.message : String(err),
                  ticker: code,
                },
                null,
                2
              ),
            },
          ],
        };
      }
    }
  );
}
