const JINA_READER_BASE_URL = 'https://r.jina.ai';

export type EnrichmentResult = {
  success: boolean;
  content: string | null;
  title: string | null;
  error?: string;
};

function getJinaApiKey(): string | undefined {
  return process.env.JINA_READER_API_KEY;
}

export async function enrichUrl(
  url: string,
  maxChars: number,
  timeoutMs: number = 15000
): Promise<EnrichmentResult> {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return {
        success: false,
        error: `Invalid URL protocol: ${parsed.protocol}`,
        content: null,
        title: null,
      };
    }
  } catch {
    return {
      success: false,
      error: `Invalid URL: ${url}`,
      content: null,
      title: null,
    };
  }

  const apiUrl = `${JINA_READER_BASE_URL}/${url}`;
  const apiKey = getJinaApiKey();

  const headers: Record<string, string> = {
    Accept: 'text/plain',
  };

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText}`,
        content: null,
        title: null,
      };
    }

    let content = await response.text();
    content = content.trim();

    let title: string | null = null;
    const lines = content.split('\n');
    if (lines.length > 0 && lines[0]?.startsWith('Title: ')) {
      title = lines[0].slice(7).trim();
      content = lines.slice(1).join('\n').trim();
    } else if (
      lines.length > 0 &&
      lines[0] &&
      !lines[0].startsWith('http') &&
      lines[0].length < 200
    ) {
      title = lines[0].trim();
    }

    if (content.length > maxChars) {
      const truncated = content.slice(0, maxChars);
      const lastNewline = truncated.lastIndexOf('\n');
      if (lastNewline > 0) {
        content = truncated.slice(0, lastNewline).trimEnd() + '\n\n...';
      } else {
        const lastSpace = truncated.lastIndexOf(' ');
        if (lastSpace > 0) {
          content = truncated.slice(0, lastSpace).trimEnd() + '...';
        } else {
          content = truncated + '...';
        }
      }
    }

    return {
      success: true,
      content,
      title,
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return {
          success: false,
          error: 'Timeout: Request took too long',
          content: null,
          title: null,
        };
      }
      return {
        success: false,
        error: `Fetch error: ${error.message}`,
        content: null,
        title: null,
      };
    }
    return {
      success: false,
      error: 'Unknown error',
      content: null,
      title: null,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
