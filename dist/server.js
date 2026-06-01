"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const prisma_1 = require("../generated/prisma");
const adapter_pg_1 = require("@prisma/adapter-pg");
const dayjs_1 = __importDefault(require("dayjs"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const adapter = new adapter_pg_1.PrismaPg({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});
const prisma = new prisma_1.PrismaClient({ adapter });
function formatTodo(todo) {
    return {
        ...todo,
        createdAt: (0, dayjs_1.default)(todo.createdAt).format('YYYY-MM-DD HH:mm:ss'),
        updatedAt: (0, dayjs_1.default)(todo.updatedAt).format('YYYY-MM-DD HH:mm:ss'),
    };
}
const app = (0, express_1.default)();
app.use(express_1.default.json());
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret-key'; // 在生产环境中请使用更安全的方式管理密钥
function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ error: '请先登录' });
    }
    try {
        const payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        req.userId = payload.userId;
        next();
    }
    catch {
        res.status(401).json({ error: '无效的认证信息' });
    }
}
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    try {
        const existingUser = await prisma.user.findUnique({ where: { username } });
        if (existingUser) {
            return res.status(400).json({ error: '用户名已存在' });
        }
        const hashedPassword = await bcryptjs_1.default.hash(password, 10);
        const user = await prisma.user.create({
            data: { username, password: hashedPassword },
        });
        res.status(201).json({ message: '注册成功', userId: user.id });
    }
    catch (error) {
        console.error('REGISTER ERROR:', error);
        res.status(500).json({ error: '服务器错误', detail: error?.message, code: error?.code });
    }
});
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
        return res.status(400).json({ error: '用户名或密码错误' });
    }
    const isPasswordValid = await bcryptjs_1.default.compare(password, user.password);
    if (!isPasswordValid) {
        return res.status(400).json({ error: '用户名或密码错误' });
    }
    const token = jsonwebtoken_1.default.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ message: '登录成功', token });
});
// ============ 路由 ============
app.get('/', (req, res) => {
    res.json({ message: 'TODO API (Prisma版) 💾' });
});
// 获取所有 todo
app.get('/api/todos', authMiddleware, async (req, res) => {
    const todos = await prisma.todo.findMany({
        where: { userId: req.userId },
        orderBy: { createdAt: 'desc' },
    });
    res.json(todos.map(formatTodo));
});
// 搜索 todo
app.get('/api/todos/search', authMiddleware, async (req, res) => {
    const { keyword } = req.query;
    const todos = await prisma.todo.findMany({
        where: {
            userId: req.userId,
            title: { contains: keyword },
        },
    });
    res.json({
        todos: todos.map(formatTodo),
        message: todos.length > 0 ? '查询成功' : '未找到相关内容',
    });
});
// 获取单个 todo
app.get('/api/todos/:id', authMiddleware, async (req, res) => {
    const id = String(req.params.id);
    const todo = await prisma.todo.findFirst({ where: { id, userId: req.userId } });
    if (!todo) {
        return res.status(404).json({ error: '未找到' });
    }
    res.json(formatTodo(todo));
});
// 创建 todo
app.post('/api/todos', authMiddleware, async (req, res) => {
    const { title } = req.body;
    if (!title) {
        return res.status(400).json({ error: 'Title is required' });
    }
    const todo = await prisma.todo.create({
        data: { title, done: false, userId: req.userId },
    });
    res.status(201).json({ message: '创建成功', todo: formatTodo(todo) });
});
// 更新 todo
app.put('/api/todos/:id', authMiddleware, async (req, res) => {
    const id = String(req.params.id);
    const { title, done } = req.body;
    try {
        const todo = await prisma.todo.findFirst({ where: { id, userId: req.userId } });
        if (!todo)
            return res.status(404).json({ error: '未找到' });
        // 再更新
        const updated = await prisma.todo.update({
            where: { id },
            data: {
                ...(title !== undefined && { title }),
                ...(done !== undefined && { done }),
            },
        });
        res.json({ message: '更新成功', todo: formatTodo(updated) });
    }
    catch {
        res.status(404).json({ error: '未找到' });
    }
});
// 删除 todo
app.delete('/api/todos/:id', authMiddleware, async (req, res) => {
    const id = String(req.params.id);
    try {
        const todo = await prisma.todo.findFirst({ where: { id, userId: req.userId } });
        if (!todo)
            return res.status(404).json({ error: '未找到' });
        await prisma.todo.delete({ where: { id } });
        res.json({ message: '删除成功', todo: formatTodo(todo) });
    }
    catch {
        res.status(404).json({ error: '未找到' });
    }
});
// 错误处理
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: '服务器内部错误' });
});
// 启动
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`💾 Prisma TODO API:
http://localhost:${PORT}`);
});
