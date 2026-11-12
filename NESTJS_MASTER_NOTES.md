# 🚀 NestJS Quick-Mastery & Interview Notes
### Written specifically for Ankush Upadhyay (3.5+ YOE Node.js Backend Engineer)

---

## 📌 1. What is NestJS & Why Does it Exist?
- **Express.js Problem:** Express is unopinionated. Every developer writes spaghetti code differently. There is no standard structure for routes, services, or business logic.
- **NestJS Solution:** A progressive Node.js framework built with **TypeScript** that brings **Angular/Spring-Boot architecture** to the Node ecosystem.
- **Under the Hood:** NestJS uses **Express** by default (or optionally Fastify for extreme speed). Everything you know about Express (`req`, `res`, middlewares) still applies!

---

## 🏛️ 2. The Core Architecture: The "Big Three"

NestJS organizes everything into clean, modular building blocks:

```
                  ┌──────────────────────┐
                  │      AppModule       │
                  └──────────┬───────────┘
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
     ┌──────────────┐                  ┌──────────────┐
     │  AuthModule  │                  │  UserModule  │
     └──────┬───────┘                  └──────┬───────┘
            │                                 │
     ┌──────┴───────┐                  ┌──────┴───────┐
     │  Controller  │                  │  Controller  │ (Handles HTTP Routing)
     └──────┬───────┘                  └──────┬───────┘
            │                                 │
     ┌──────┴───────┐                  ┌──────┴───────┐
     │   Service    │                  │   Service    │ (Business Logic & DB)
     └──────────────┘                  └──────────────┘
```

### 1. Modules (`@Module`)
- A Module is a container that bundles related code together (e.g. `UserModule`, `PaymentModule`, `AuthModule`).
```typescript
@Module({
  imports: [TypeOrmModule.forFeature([User])], // Database Entities
  controllers: [UserController],               // HTTP Routes
  providers: [UserService],                   // Business Logic / DB operations
  exports: [UserService],                     // Export to share with other modules
})
export class UserModule {}
```

### 2. Controllers (`@Controller`)
- Responsible for **routing incoming HTTP requests** and returning responses to the client.
- **Never put business logic or SQL queries here.** Just call the Service.
```typescript
@Controller('users') // Base route: /users
export class UserController {
  constructor(private readonly userService: UserService) {} // Dependency Injection!

  @Get() // GET /users
  findAll() {
    return this.userService.getAllUsers();
  }

  @Post() // POST /users
  create(@Body() createUserDto: CreateUserDto) {
    return this.userService.createUser(createUserDto);
  }

  @Get(':id') // GET /users/:id
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.userService.getUserById(id);
  }
}
```

### 3. Services / Providers (`@Injectable`)
- Contains all **business logic, calculations, database queries, and third-party API calls**.
```typescript
@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>, // Inject Database Model
  ) {}

  async getAllUsers(): Promise<User[]> {
    return await this.userRepository.find();
  }

  async createUser(dto: CreateUserDto): Promise<User> {
    const newUser = this.userRepository.create(dto);
    return await this.userRepository.save(newUser);
  }
}
```

---

## 💉 3. The Superpower: Dependency Injection (DI)

### What is DI?
- Instead of manually instantiating classes with `const service = new UserService()`, **NestJS IoC (Inversion of Control) Container creates and manages the instances for you.**
- When `UserController` asks for `UserService` in its constructor:
  ```typescript
  constructor(private readonly userService: UserService) {}
  ```
  Nest automatically finds `UserService`, instantiates it as a singleton, and injects it!

### Why Interviewers Care:
- **Testability:** Makes unit testing trivial with mock services.
- **Decoupling:** Modules don't tightly depend on class creation details.

---

## 🛡️ 4. Guards, Pipes & Interceptors (The Interview Favorites)

| Feature | Where it Runs | Typical Real-World Use Case |
| :--- | :--- | :--- |
| **Pipes** | **Before Route Handler** | Request validation & transformation (e.g. checking DTO with `class-validator` or converting string to integer). |
| **Guards** | **Before Route Handler** | Authentication & RBAC (e.g. checking JWT token validity, checking if `role === 'ADMIN'`). |
| **Interceptors** | **Before & After Handler** | Logging execution time, caching responses in Redis, transforming output format. |
| **Filters** | **When Error Thrown** | Catching unhandled exceptions and returning standard formatted JSON errors. |

### Real Guard Example (JWT / RBAC Auth):
```typescript
@Injectable()
export class RolesGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    return user && user.role === 'ADMIN'; // Returns true (allowed) or false (403 Forbidden)
  }
}

// In Controller:
@Post('admin/delete-database')
@UseGuards(JwtAuthGuard, RolesGuard) // Protects the route automatically!
deleteDb() { ... }
```

### Real Pipe Example (DTO Validation with class-validator):
```typescript
export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;

  @MinLength(8)
  password: string;
}
// Any invalid request automatically gets rejected with a clean 400 Bad Request!
```

---

## 🎯 5. Top 5 NestJS Technical Interview Questions & Exact Answers

### Q1: What is the difference between an Express Middleware and a NestJS Interceptor?
- **Answer:** *"Express middleware executes sequentially before the route handler and doesn't know what route will handle the request. A NestJS Interceptor wraps both the request and response using RxJS Observables, giving us access to execution context before and after the handler executes, which is ideal for caching, logging, and response transformation."*

### Q2: What is the lifecycle scope of a Provider in NestJS?
- **Answer:**
  1. **DEFAULT (Singleton):** One instance is shared across the entire application (best performance, default).
  2. **REQUEST:** A new instance is created for every incoming HTTP request (useful for tenant isolation, but has memory overhead).
  3. **TRANSIENT:** A dedicated instance is created for each class that injects it.

### Q3: How do you handle database transactions in NestJS with PostgreSQL?
- **Answer:** *"Using TypeORM or Prisma with QueryRunner. We start a transaction with `queryRunner.startTransaction()`, execute our database operations, and commit with `queryRunner.commitTransaction()`. If any error occurs in the `catch` block, we rollback with `queryRunner.rollbackTransaction()` and release the connection."*

### Q4: What is the purpose of DTOs (Data Transfer Objects)?
- **Answer:** *"A DTO defines the exact shape of data over the network. In NestJS, combined with `class-validator` and `ValidationPipe`, DTOs provide compile-time TypeScript type safety and runtime schema validation, preventing malicious or malformed payloads from reaching our business services."*

### Q5: How does NestJS support Microservices and Event-Driven systems?
- **Answer:** *"NestJS has built-in microservice transport layers (`@nestjs/microservices`) supporting Apache Kafka, RabbitMQ, Redis Pub/Sub, and gRPC out of the box using simple `@MessagePattern()` and `@EventPattern()` decorators without needing custom networking code."*

---

## ⚡ 6. Your 3-Day Action Checklist (This Weekend)
- [ ] **Day 1 (Friday Night):** Install Nest CLI: `npm i -g @nestjs/cli` and create project: `nest new backend-system`. Explore `main.ts`, `app.module.ts`, `app.controller.ts`.
- [ ] **Day 2 (Saturday):** Build a REST API with TypeORM / Prisma connected to local PostgreSQL. Create `users` and `auth` modules with JWT Login and Password Hashing (`bcrypt`).
- [ ] **Day 3 (Sunday):** Add `ValidationPipe` with `class-validator`, add a Redis caching interceptor, and Dockerize it (`Dockerfile` + `docker-compose.yml`).
- [ ] **Push to GitHub & Update LinkedIn:** Pin it as **"Production NestJS Microservices Starter"**!

