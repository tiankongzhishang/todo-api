import express, { Request, Response, NextFunction } from 'express'
import { PrismaClient } from './generated/prisma'
import dayjs from 'dayjs'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const prisma = new PrismaClient()

function formatTodo<T extends { createdAt: Date; updatedAt: Date }>(todo: T) {
  return {
    ...todo,
    createdAt: dayjs(todo.createdAt).format('YYYY-MM-DD HH:mm:ss'),
    updatedAt: dayjs(todo.updatedAt).format('YYYY-MM-DD HH:mm:ss'),
  }
}

const app = express()
// const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
// const prisma = new PrismaClient({
//   adapter: new PrismaPg(pool),
// })

app.use(express.json())

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret-key' // 在生产环境中请使用更安全的方式管理密钥

interface AuthRequest extends Request {
  userId?: string
}

function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) {
    return res.status(401).json({ error: '请先登录' })
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string }
    req.userId = payload.userId
    next()
  } catch {
    res.status(401).json({ error: '无效的认证信息' })
  }
}

app.post('/api/register', async (req: Request, res: Response) => {
  const { username, password } = req.body
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' })
  }
  const existingUser = await prisma.user.findUnique({ where: { username } })
  if (existingUser) {
    return res.status(400).json({ error: '用户名已存在' })
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10)
    const user = await prisma.user.create({
      data: { username, password: hashedPassword },
    })
    res.status(201).json({ message: '注册成功', userId: user.id })
  } catch (error) {
    res.status(500).json({ error: '服务器错误' })
  }
})

app.post('/api/login', async (req: Request, res: Response) => {
  const { username, password } = req.body
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' })
  }
  const user = await prisma.user.findUnique({ where: { username } })
  if (!user) {
    return res.status(400).json({ error: '用户名或密码错误' })
  }
  const isPasswordValid = await bcrypt.compare(password, user.password)
  if (!isPasswordValid) {
    return res.status(400).json({ error: '用户名或密码错误' })
  }
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' })
  res.json({ message: '登录成功', token })
})

// ============ 路由 ============
app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'TODO API (Prisma版) 💾' })
})

// 获取所有 todo
app.get('/api/todos', authMiddleware, async (req: AuthRequest, res: Response) => {
  const todos = await prisma.todo.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'desc' },
  })
  res.json(todos.map(formatTodo))
})

// 搜索 todo
app.get('/api/todos/search', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { keyword } = req.query
  const todos = await prisma.todo.findMany({
    where: {
      userId: req.userId,
      title: { contains: keyword as string },
    },
  })
  res.json({
    todos: todos.map(formatTodo),
    message: todos.length > 0 ? '查询成功' : '未找到相关内容',
  })
})

// 获取单个 todo
app.get('/api/todos/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id)
  const todo = await prisma.todo.findFirst({ where: { id, userId: req.userId } })
  if (!todo) {
    return res.status(404).json({ error: '未找到' })
  }
  res.json(formatTodo(todo))
})

// 创建 todo
app.post('/api/todos', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { title } = req.body
  if (!title) {
    return res.status(400).json({ error: 'Title is required' })
  }
  const todo = await prisma.todo.create({
    data: { title, done: false, userId: req.userId! },
  })
  res.status(201).json({ message: '创建成功', todo: formatTodo(todo) })
})

// 更新 todo
app.put('/api/todos/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id)
  const { title, done } = req.body
  try {
    const todo = await prisma.todo.findFirst({ where: { id, userId: req.userId! } })
    if (!todo) return res.status(404).json({ error: '未找到' })
    // 再更新
    const updated = await prisma.todo.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(done !== undefined && { done }),
      },
    })
    res.json({ message: '更新成功', todo: formatTodo(updated) })
  } catch {
    res.status(404).json({ error: '未找到' })
  }
})

// 删除 todo
app.delete('/api/todos/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id)
  try {
    const todo = await prisma.todo.findFirst({ where: { id, userId: req.userId! } })
    if (!todo) return res.status(404).json({ error: '未找到' })
    await prisma.todo.delete({ where: { id } })
    res.json({ message: '删除成功', todo: formatTodo(todo) })
  } catch {
    res.status(404).json({ error: '未找到' })
  }
})

// 错误处理
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack)
  res.status(500).json({ error: '服务器内部错误' })
})

// 启动
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`💾 Prisma TODO API:
http://localhost:${PORT}`)
})
