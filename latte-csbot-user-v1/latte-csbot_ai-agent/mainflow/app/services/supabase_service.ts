import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { embedModel } from './ai_service';

const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '') + '/';
const supabase: SupabaseClient = createClient(supabaseUrl, process.env.SUPABASE_KEY || '', {
  auth: { persistSession: false },
});

let vectorStore: SupabaseVectorStore | undefined;

export function getVectorStore(): SupabaseVectorStore {
  if (!vectorStore) {
    vectorStore = new SupabaseVectorStore(embedModel, {
      client: supabase,
      tableName: 'document_chunks',
      queryName: 'match_documents',
    });
  }
  return vectorStore;
}

export interface SearchResult {
  text: string;
  images: string[];
}

export async function searchKnowledgeBase(
  query: string,
  topK: number = 15
): Promise<SearchResult> {
  try {
    const startTime = Date.now();

    const store = getVectorStore();
    const documents = await store.similaritySearch(query, topK);

    if (!documents || documents.length === 0) {
      console.log('🔎 [LangChain] No relevant knowledge found.');
      return { text: '', images: [] };
    }

    console.log(`🔎 [LangChain] Found ${documents.length} relevant documents.`);

    const sortedDocs = documents.sort((a, b) => {
      const pageA = (a.metadata?.page as number) ?? 9999;
      const pageB = (b.metadata?.page as number) ?? 9999;
      if (pageA !== pageB) return pageA - pageB;

      const posA = (a.metadata?.position_in_page as number) ?? 9999;
      const posB = (b.metadata?.position_in_page as number) ?? 9999;
      return posA - posB;
    });

    const contextParts: string[] = [];
    let currentPage = -1;

    sortedDocs.forEach((doc) => {
      const metadata = doc.metadata || {};
      const content = (doc.pageContent || '').trim();
      const page = metadata.page as number | undefined;

      if (page && page !== currentPage) {
        if (currentPage !== -1) contextParts.push(`\n--- จบข้อมูลหน้า ${currentPage} ---\n`);
        contextParts.push(`\n--- ข้อมูลจากหน้า ${page} ---\n`);
        currentPage = page;
      }

      contextParts.push(content);
    });

    const finalContext = contextParts.join('\n');
    console.log(`✅ [LangChain] Final Context reconstructed. Took ${Date.now() - startTime}ms`);

    return {
      text: finalContext,
      images: [],
    };
  } catch (error) {
    console.error('❌ LangChain Retrieval Error:', (error as Error).message);
    return { text: '', images: [] };
  }
}
