const { createClient } = require('@supabase/supabase-js');
const { SupabaseVectorStore } = require('@langchain/community/vectorstores/supabase');
const { embedModel } = require('./ai_service');

// สร้าง Supabase Client
const supabaseUrl = process.env.SUPABASE_URL.replace(/\/+$/, '') + '/';
const supabase = createClient(supabaseUrl, process.env.SUPABASE_KEY, {
    auth: { persistSession: false }
});

let vectorStore;

/**
 * ดึง Vector Store instance (LangChain)
 */
function getVectorStore() {
    if (!vectorStore) {
        vectorStore = new SupabaseVectorStore(embedModel, {
            client: supabase,
            tableName: "document_chunks",
            queryName: "match_documents",
        });
    }
    return vectorStore;
}

/**
 * ค้นหาความรู้และเตรียม Context ด้วย LangChain
 */
async function searchKnowledgeBase(query, topK = 15) {
    try {
        const startTime = Date.now();
        
        // 1. Get Vector Store
        const store = getVectorStore();
        
        // 2. Similarity Search
        const documents = await store.similaritySearch(query, topK);
        
        if (!documents || documents.length === 0) {
            console.log(`🔎 [LangChain] No relevant knowledge found.`);
            return { text: "", images: [] };
        }

        console.log(`🔎 [LangChain] Found ${documents.length} relevant documents.`);

        // 3. Sort and Reconstruct Context (Maintaining original logic)
        const sortedDocs = documents.sort((a, b) => {
            const pageA = a.metadata?.page ?? 9999;
            const pageB = b.metadata?.page ?? 9999;
            if (pageA !== pageB) return pageA - pageB;

            const posA = a.metadata?.position_in_page ?? 9999;
            const posB = b.metadata?.position_in_page ?? 9999;
            return posA - posB;
        });

        let contextParts = [];
        let currentPage = -1;

        sortedDocs.forEach(doc => {
            const metadata = doc.metadata || {};
            const content = (doc.pageContent || "").trim();
            const page = metadata.page;

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
            images: []
        };

    } catch (error) {
        console.error("❌ LangChain Retrieval Error:", error.message);
        return { text: "", images: [] };
    }
}

module.exports = { searchKnowledgeBase };