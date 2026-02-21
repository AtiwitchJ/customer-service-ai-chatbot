# Migration Guide: v1/v2 → Modular Architecture

คู่มือการย้ายจากระบบเก่า (v1/v2) ไปยังโครงสร้างใหม่แบบ Modular

## สรุปการเปลี่ยนแปลง

### โครงสร้างเดิม

```
latta-csbot-user-v1/  →  มี Supabase + MongoDB + Services ครบในไฟล์เดียว
latta-csbot-user-v2/  →  มี Supabase + MongoDB + Services ครบในไฟล์เดียว
latta-csbot-admin/    →  แยกออกมาแล้ว แต่ยังเชื่อมต่อกับ v2
```

### โครงสร้างใหม่

```
latta-csbot-database/  →  Supabase + MongoDB + Redis + RabbitMQ (แชร์กัน)
latta-csbot-admin/     →  Admin Panel + RAG (เชื่อมต่อ database)
latta-csbot-user/      →  User Services + AI Agent (เชื่อมต่อ database)
```

## ขั้นตอนการย้าย

### 1. สำรองข้อมูลเดิม

```bash
# ไปยังโฟลเดอร์ v2
cd latta-csbot-user-v2

# Backup PostgreSQL
docker exec latta_v2-supabase-db pg_dumpall -c -U postgres > ../postgres_backup.sql

# Backup MongoDB
docker exec latta_v2-mongodb mongodump --archive > ../mongo_backup.archive

# หยุดระบบเดิม
docker compose down
```

### 2. ย้าย Volumes

```bash
# กลับไปยัง root directory
cd ..

# คัดลอก PostgreSQL data
cp -r latta-csbot-user-v2/volumes/db/data latta-csbot-database/volumes/db/

# คัดลอก Storage files
cp -r latta-csbot-user-v2/volumes/storage latta-csbot-database/volumes/

# คัดลอก MongoDB data (ถ้ามี)
cp -r latta-csbot-user-v2/volumes/mongodb latta-csbot-database/volumes/ 2>/dev/null || true
```

### 3. ตั้งค่า Environment Variables

#### 3.1 latta-csbot-database/.env

```bash
cd latta-csbot-database
cp .env.example .env

# แก้ไขค่าต่างๆ ให้ตรงกับระบบเดิม
# - POSTGRES_PASSWORD
# - JWT_SECRET
# - ANON_KEY
# - SERVICE_ROLE_KEY
# - MONGO_ROOT_PASSWORD
# - REDIS_PASSWORD
```

#### 3.2 latta-csbot-admin/.env

```bash
cd ../latta-csbot-admin
cp .env.example .env

# สำคัญ: ใช้ค่าเดียวกับ database
SUPABASE_URL=http://kong:8000
SUPABASE_KEY=<SERVICE_ROLE_KEY จาก database>
SUPABASE_PUBLIC_URL=http://localhost:8000

# Ollama
OLLAMA_BASE_URL=http://host.docker.internal:11434  # หรือ URL ของ Ollama server
```

#### 3.3 latta-csbot-user/.env

```bash
cd ../latta-csbot-user
cp .env.example .env

# สำคัญ: ใช้ค่าเดียวกับ database
MONGO_ROOT_PASSWORD=<password เดียวกับ database>
REDIS_PASSWORD=<password เดียวกับ database>
RABBITMQ_USER=<user เดียวกับ database>
RABBITMQ_PASSWORD=<password เดียวกับ database>

SUPABASE_KEY=<SERVICE_ROLE_KEY จาก database>
```

### 4. เริ่มต้นระบบใหม่

```bash
# เริ่มจาก root directory
cd ..

# เริ่ม database ก่อน
docker compose -f latta-csbot-database/docker-compose.yml up -d

# รอให้ database พร้อม (ประมาณ 30-60 วินาที)
sleep 60

# เริ่ม admin
docker compose -f latta-csbot-admin/docker-compose.yml up -d

# เริ่ม user services
docker compose -f latta-csbot-user/docker-compose.yml up -d
```

หรือใช้คำสั่งเดียว:

```bash
docker compose up -d
```

### 5. ตรวจสอบการทำงาน

```bash
# ดูสถานะทั้งหมด
docker compose ps

# ตรวจสอบ logs
docker compose logs -f

# ทดสอบ Supabase
curl http://localhost:8000/health

# ทดสอบ Admin Backend
curl http://localhost:3002/api/overview

# ทดสอบ User Backend
curl http://localhost:3000/config
```

## การแก้ไขปัญหาที่พบบ่อย

### 1. Port ชนกัน

**ปัญหา**: 
```
Error response from daemon: Ports are not available: exposing port TCP 0.0.0.0:80 → 0.0.0.0:0: listen tcp 0.0.0.0:80: bind: address already in use
```

**แก้ไข**: แก้ไข port ในไฟล์ `.env`:

```env
# latta-csbot-user/.env
USER_FRONTEND_PORT=8080

# latta-csbot-admin/.env
ADMIN_FRONTEND_PORT=8081
```

### 2. Network ไม่เจอ

**ปัญหา**:
```
Error response from daemon: network latta-database-network not found
```

**แก้ไข**: ต้องรัน database ก่อนเสมอ:

```bash
docker compose -f latta-csbot-database/docker-compose.yml up -d
```

### 3. ไม่สามารถเชื่อมต่อ Supabase ได้

**ปัญหา**: Services ไม่สามารถเชื่อมต่อกับ `kong:8000` ได้

**แก้ไข**: 
1. ตรวจสอบว่า services อยู่ใน network `latta-database-network`
2. ตรวจสอบว่า `SUPABASE_URL=http://kong:8000` ในทุกไฟล์ `.env`
3. Restart services:
   ```bash
   docker compose -f latta-csbot-admin/docker-compose.yml restart
   docker compose -f latta-csbot-user/docker-compose.yml restart
   ```

### 4. MongoDB Authentication Failed

**ปัญหา**: `Authentication failed`

**แก้ไข**: ตรวจสอบว่า `MONGO_ROOT_PASSWORD` ตรงกันในทั้ง database และ user:

```env
# latta-csbot-database/.env และ latta-csbot-user/.env
MONGO_ROOT_PASSWORD=your-password
```

## การ Rollback (กลับไปใช้ระบบเดิม)

หากต้องการกลับไปใช้ระบบเดิม:

```bash
# หยุดระบบใหม่
docker compose down

# กลับไปใช้ระบบเดิม
cd latta-csbot-user-v2
docker compose up -d
```

## Checklist

- [ ] สำรองข้อมูล PostgreSQL
- [ ] สำรองข้อมูล MongoDB
- [ ] คัดลอก volumes ไปยัง `latta-csbot-database/volumes/`
- [ ] ตั้งค่า `.env` ใน `latta-csbot-database/`
- [ ] ตั้งค่า `.env` ใน `latta-csbot-admin/` (ใช้ค่าเดียวกับ database)
- [ ] ตั้งค่า `.env` ใน `latta-csbot-user/` (ใช้ค่าเดียวกับ database)
- [ ] รัน database ก่อน
- [ ] รัน admin และ user
- [ ] ทดสอบการทำงานทั้งหมด
- [ ] ตรวจสอบ logs ไม่มี error

## ติดต่อสอบถาม

หากพบปัญหา กรุณาตรวจสอบ:
1. Logs ของแต่ละ service: `docker compose logs [service-name]`
2. สถานะ container: `docker compose ps`
3. Network connections: `docker network inspect latta-database-network`
