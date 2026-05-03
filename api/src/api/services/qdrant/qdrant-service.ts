import type { NewsTable } from "@models";

const QDRANT_URL = "http://10.11.0.1:6333";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";

interface NewsEmbedding {
  id: number;
  vector: number[];
  payload: {
    news_id: number;
    title: string;
    content: string;
    source: string;
    published_date: string;
    category: string;
    summary: string | null;
    author: string | null;
    url: string;
    image_url: string | null;
  };
}

interface QdrantResponse {
  result: {
    status: string;
    operation_id: string;
  };
}

export async function generateEmbedding(text: string): Promise<number[]> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set in environment variables");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_EMBEDDING_MODEL,
        input: text,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        `Failed to generate embedding: status=${response.status}, statusText=${response.statusText}, data=${JSON.stringify(data)}`
      );
    }

    if (!data.data || !data.data[0] || !data.data[0].embedding) {
      throw new Error(`Invalid embedding response: ${JSON.stringify(data)}`);
    }

    return data.data[0].embedding;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Failed to generate embedding: request timeout");
    }
    throw error;
  }
}

export async function upsertNewsToQdrant(news: NewsTable): Promise<void> {
  try {
    const embedding = await generateEmbedding(
      `${news.title} ${news.content} ${news.summary || ""}`
    );

    const newsEmbedding: NewsEmbedding = {
      id: news.id,
      vector: embedding,
      payload: {
        news_id: news.id,
        title: news.title,
        content: news.content,
        source: news.source,
        published_date: news.published_date,
        category: news.category,
        summary: news.summary,
        author: news.author,
        url: news.url,
        image_url: news.image_url,
      },
    };

    const response = await fetch(`${QDRANT_URL}/collections/news/points`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        points: [newsEmbedding],
        on_conflict: {
          action: "overwrite",
        },
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(`Failed to upsert news to Qdrant: status=${response.status}, data=${JSON.stringify(data)}`);
    }
  } catch (error) {
    console.error(`Error upserting news item with id ${news.id}:`, error);
    throw error;
  }
}

export async function ensureNewsCollectionExists(): Promise<void> {
  const response = await fetch(`${QDRANT_URL}/collections/news`, {
    method: "GET",
  });

  if (response.ok) {
    console.log("Collection 'news' already exists");
    return;
  }

  console.log("Creating collection 'news'...");
  const createResponse = await fetch(`${QDRANT_URL}/collections/news`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "news",
      vectors: {
        size: 1536,
        distance: "Cosine",
      },
    }),
  });

  if (!createResponse.ok) {
    const data = await createResponse.json().catch(() => ({}));
    throw new Error(`Failed to create news collection: status=${createResponse.status}, data=${JSON.stringify(data)}`);
  }

  console.log("Collection 'news' created successfully");
}

export async function clearNewsCollection(): Promise<void> {
  const response = await fetch(`${QDRANT_URL}/collections/news/points/delete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filter: {},
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(`Failed to clear news collection: status=${response.status}, data=${JSON.stringify(data)}`);
  }

  console.log("News collection cleared successfully");
}

export async function searchSimilarNews(
  query: string,
  limit: number = 5
): Promise<NewsEmbedding[]> {
  const queryEmbedding = await generateEmbedding(query);

  const response = await fetch(
    `${QDRANT_URL}/collections/news/points/search`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        vector: queryEmbedding,
        limit,
        with_payload: true,
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `Failed to search news: status=${response.status}, statusText=${response.statusText}, data=${JSON.stringify(data)}`
    );
  }

  if (!data.result) {
    throw new Error(`Invalid search response: ${JSON.stringify(data)}`);
  }

  return data.result.map((result: any) => ({
    id: result.id,
    vector: result.vector,
    payload: {
      news_id: result.payload.news_id,
      title: result.payload.title,
      content: result.payload.content,
      source: result.payload.source,
      published_date: result.payload.published_date,
      category: result.payload.category,
      summary: result.payload.summary,
      author: result.payload.author,
      url: result.payload.url,
      image_url: result.payload.image_url,
    },
  }));
}