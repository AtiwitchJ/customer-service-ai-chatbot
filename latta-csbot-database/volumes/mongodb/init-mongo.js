// MongoDB init script - run on first startup
// Creates chatbot database and collections
db = db.getSiblingDB('chatbot');
db.createCollection('sessions');
