require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const admin = require('firebase-admin')
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

const port = process.env.PORT || 3000
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf-8')
const serviceAccount = JSON.parse(decoded)
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })

const app = express()
app.use(cors({ origin: [process.env.DOMAIN_URL], credentials: true, optionSuccessStatus: 200 }))
app.use(express.json())

// ── Middlewares ──

const verifyJWT = async (req, res, next) => {
  const token = req?.headers?.authorization?.split(' ')[1]
  if (!token) return res.status(401).send({ message: 'Unauthorized Access!' })
  try {
    const decoded = await admin.auth().verifyIdToken(token)
    req.tokenEmail = decoded.email
    next()
  } catch (err) {
    return res.status(401).send({ message: 'Unauthorized Access!', err })
  }
}

const verifyAdmin = async (req, res, next) => {
  const email = req.tokenEmail
  const user = await client.db('smart_kids').collection('users').findOne({ email })
  if (user?.role !== 'admin') return res.status(403).send({ message: 'Forbidden Access!' })
  next()
}

const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
})

async function run() {
  try {
    const db = client.db('smart_kids')
    const coursesCollection = db.collection('courses')
    const usersCollection = db.collection('users')
    const enrollmentsCollection = db.collection('enrollments')
    const lessonsCollection = db.collection('lessons')
    const quizzesCollection = db.collection('quizzes')
    const lessonProgressCollection = db.collection('lesson_progress')
    const quizResultsCollection = db.collection('quiz_results')
    const reviewsCollection = db.collection('reviews')

    // ════════════════════════════════════════
    // USER ROUTES
    // ════════════════════════════════════════

    // Save user (public — called on register/google login)
    app.post('/users', async (req, res) => {
      try {
        const user = req.body
        const existing = await usersCollection.findOne({ email: user.email })
        if (existing) return res.send({ message: 'User already exists', insertedId: null })
        const result = await usersCollection.insertOne(user)
        res.status(201).send(result)
      } catch (error) {
        res.status(500).send({ message: 'Error saving user' })
      }
    })

    // Get user by email (public — used for PIN check, profile)
    app.get('/users/:email', async (req, res) => {
      try {
        const user = await usersCollection.findOne({ email: req.params.email })
        res.send(user)
      } catch (error) {
        res.status(500).send({ message: 'Error fetching user' })
      }
    })

    // Get current user role (protected — used by useRole hook)
    app.get('/user/role', verifyJWT, async (req, res) => {
      try {
        const user = await usersCollection.findOne({ email: req.tokenEmail })
        res.send({ role: user?.role || 'guardian' })
      } catch (error) {
        res.status(500).send({ message: 'Error fetching role' })
      }
    })

    // Update user profile (protected)
    app.put('/users/:email', verifyJWT, async (req, res) => {
      try {
        const { email } = req.params
        if (req.tokenEmail !== email) return res.status(403).send({ message: 'Forbidden' })
        const result = await usersCollection.updateOne({ email }, { $set: req.body })
        res.send(result)
      } catch (error) {
        res.status(500).send({ message: 'Error updating user' })
      }
    })

    // ════════════════════════════════════════
    // COURSE ROUTES
    // ════════════════════════════════════════

    // Get all courses (public)
    app.get('/course', async (req, res) => {
      try {
        const courses = await coursesCollection.find({}).toArray()
        res.status(200).send(courses)
      } catch (error) {
        res.status(500).send({ message: 'Error fetching courses' })
      }
    })

    // Get one course by id (public)
    app.get('/course/:id', async (req, res) => {
      try {
        const course = await coursesCollection.findOne({ _id: new ObjectId(req.params.id) })
        res.send(course)
      } catch (error) {
        res.status(500).send({ message: 'Error fetching course' })
      }
    })

    // Add course (admin only)
    app.post('/courses', verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const result = await coursesCollection.insertOne(req.body)
        res.status(201).send(result)
      } catch (error) {
        res.status(500).send({ message: 'Error adding course' })
      }
    })

    // Update course (admin only)
    app.put('/course/:id', verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const courseData = req.body
        const result = await coursesCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          {
            $set: {
              emoji: courseData.emoji, title: courseData.title, titleBn: courseData.titleBn,
              subject: courseData.subject, subjectBn: courseData.subjectBn,
              class: courseData.class, classBn: courseData.classBn,
              level: courseData.level, levelBn: courseData.levelBn,
              duration: courseData.duration, durationBn: courseData.durationBn,
              lessons: courseData.lessons, quizzes: courseData.quizzes,
              color: courseData.color, badge: courseData.badge,
              price: courseData.price, priceBn: courseData.priceBn, priceAmount: courseData.priceAmount,
              instructor: courseData.instructor, instructorBn: courseData.instructorBn,
              instructorRole: courseData.instructorRole, instructorRoleBn: courseData.instructorRoleBn,
              description: courseData.description, descriptionBn: courseData.descriptionBn,
              whatYouLearn: courseData.whatYouLearn, whatYouLearnBn: courseData.whatYouLearnBn,
              curriculum: courseData.curriculum,
              requirements: courseData.requirements, requirementsBn: courseData.requirementsBn,
              tags: courseData.tags, status: courseData.status,
            },
          }
        )
        res.send(result)
      } catch (error) {
        res.status(500).send({ message: 'Error updating course' })
      }
    })

    // Delete course + cascade (admin only)
    app.delete('/course/:id', verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const id = req.params.id
        const lessons = await lessonsCollection.find({ courseId: id }).toArray()
        const lessonIds = lessons.map(l => l._id.toString())
        if (lessonIds.length > 0) await quizzesCollection.deleteMany({ lessonId: { $in: lessonIds } })
        await lessonsCollection.deleteMany({ courseId: id })
        await enrollmentsCollection.deleteMany({ courseId: id })
        await lessonProgressCollection.deleteMany({ courseId: id })
        await quizResultsCollection.deleteMany({ courseId: id })
        const result = await coursesCollection.deleteOne({ _id: new ObjectId(id) })
        res.send({ success: true, deletedCourse: result.deletedCount })
      } catch (error) {
        res.status(500).send({ message: 'Error deleting course' })
      }
    })

    // ════════════════════════════════════════
    // ENROLLMENT & PAYMENT ROUTES
    // ════════════════════════════════════════

    // Free enrollment (protected)
    app.post('/enrollments', verifyJWT, async (req, res) => {
      try {
        const { courseId, courseTitle, userEmail, userName } = req.body
        if (req.tokenEmail !== userEmail) return res.status(403).send({ message: 'Forbidden' })
        const existing = await enrollmentsCollection.findOne({ courseId, userEmail })
        if (existing) return res.send({ success: true, message: 'Already enrolled' })
        const result = await enrollmentsCollection.insertOne({
          courseId, courseTitle, userEmail, userName, payment: false, enrolledAt: new Date()
        })
        await coursesCollection.updateOne({ _id: new ObjectId(courseId) }, { $inc: { enrolled: 1 } })
        res.status(201).send({ success: true, insertedId: result.insertedId })
      } catch (err) {
        res.status(500).send({ message: 'Error saving enrollment' })
      }
    })

    // Get enrollments by email (protected)
    app.get('/enrollments/:email', verifyJWT, async (req, res) => {
      try {
        if (req.tokenEmail !== req.params.email) return res.status(403).send({ message: 'Forbidden' })
        const data = await enrollmentsCollection.find({ userEmail: req.params.email }).toArray()
        res.send(data)
      } catch (err) {
        res.status(500).send({ message: 'Error fetching enrollments' })
      }
    })

    // Create Stripe checkout session (public — Stripe handles auth)
    app.post('/create-checkout-session', async (req, res) => {
      try {
        const { courseId, courseTitle, description, priceAmount, userEmail, userName } = req.body
        const session = await stripe.checkout.sessions.create({
          line_items: [{
            price_data: {
              currency: 'usd',
              product_data: { name: courseTitle, description: description || '' },
              unit_amount: Math.round(priceAmount * 100)
            },
            quantity: 1
          }],
          customer_email: userEmail,
          mode: 'payment',
          metadata: { courseId, courseTitle, userEmail, userName: userName || '' },
          success_url: `${process.env.DOMAIN_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.DOMAIN_URL}/courses/${courseId}`
        })
        res.send({ url: session.url })
      } catch (err) {
        res.status(500).send({ message: 'Error creating checkout session' })
      }
    })

    // Payment success — verify & save (public — called after Stripe redirect)
    app.post('/payment-success', async (req, res) => {
      try {
        const { sessionId } = req.body
        const session = await stripe.checkout.sessions.retrieve(sessionId)
        if (session.payment_status !== 'paid') return res.send({ success: false, message: 'Payment not completed' })
        const { courseId, courseTitle, userEmail, userName } = session.metadata
        const existing = await enrollmentsCollection.findOne({ courseId, userEmail })
        if (existing) {
          return res.send({ success: true, message: 'Already enrolled', enrollmentId: existing._id, transactionId: session.payment_intent })
        }
        const result = await enrollmentsCollection.insertOne({
          courseId, courseTitle, userEmail, userName,
          payment: true, transactionId: session.payment_intent,
          paymentDate: new Date(), enrolledAt: new Date()
        })
        await coursesCollection.updateOne({ _id: new ObjectId(courseId) }, { $inc: { enrolled: 1 } })
        res.send({ success: true, message: 'Payment successful & enrolled', enrollmentId: result.insertedId, transactionId: session.payment_intent })
      } catch (err) {
        res.status(500).send({ message: 'Error processing payment' })
      }
    })

    // ════════════════════════════════════════
    // LESSON ROUTES
    // ════════════════════════════════════════

    // Get all lessons for a course (public)
    app.get('/lessons/:courseId', async (req, res) => {
      try {
        const lessons = await lessonsCollection
          .find({ courseId: req.params.courseId })
          .sort({ weekIndex: 1, order: 1 })
          .toArray()
        res.send(lessons)
      } catch (err) {
        res.status(500).send({ message: 'Error fetching lessons' })
      }
    })

    // Add lesson (admin only)
    app.post('/lessons', verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const result = await lessonsCollection.insertOne({ ...req.body, createdAt: new Date() })
        res.status(201).send(result)
      } catch (err) {
        res.status(500).send({ message: 'Error adding lesson' })
      }
    })

    // Update lesson (admin only)
    app.put('/lessons/:id', verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const result = await lessonsCollection.updateOne(
          { _id: new ObjectId(req.params.id) }, { $set: req.body }
        )
        res.send(result)
      } catch (err) {
        res.status(500).send({ message: 'Error updating lesson' })
      }
    })

    // Delete lesson (admin only)
    app.delete('/lessons/:id', verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const result = await lessonsCollection.deleteOne({ _id: new ObjectId(req.params.id) })
        await quizzesCollection.deleteMany({ lessonId: req.params.id })
        res.send(result)
      } catch (err) {
        res.status(500).send({ message: 'Error deleting lesson' })
      }
    })

    // ════════════════════════════════════════
    // QUIZ ROUTES
    // ════════════════════════════════════════

    // Get quiz by lessonId (public)
    app.get('/quizzes/:lessonId', async (req, res) => {
      try {
        const quiz = await quizzesCollection.findOne({ lessonId: req.params.lessonId })
        res.send(quiz || null)
      } catch (err) {
        res.status(500).send({ message: 'Error fetching quiz' })
      }
    })

    // Get all quizzes for a course (public)
    app.get('/quizzes/course/:courseId', async (req, res) => {
      try {
        const quizzes = await quizzesCollection.find({ courseId: req.params.courseId }).toArray()
        res.send(quizzes)
      } catch (err) {
        res.status(500).send({ message: 'Error fetching quizzes' })
      }
    })

    // Add quiz (admin only)
    app.post('/quizzes', verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const result = await quizzesCollection.insertOne({ ...req.body, createdAt: new Date() })
        res.status(201).send(result)
      } catch (err) {
        res.status(500).send({ message: 'Error adding quiz' })
      }
    })

    // Update quiz (admin only)
    app.put('/quizzes/:id', verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const result = await quizzesCollection.updateOne(
          { _id: new ObjectId(req.params.id) }, { $set: req.body }
        )
        res.send(result)
      } catch (err) {
        res.status(500).send({ message: 'Error updating quiz' })
      }
    })

    // Delete quiz (admin only)
    app.delete('/quizzes/:id', verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const result = await quizzesCollection.deleteOne({ _id: new ObjectId(req.params.id) })
        res.send(result)
      } catch (err) {
        res.status(500).send({ message: 'Error deleting quiz' })
      }
    })

    // ════════════════════════════════════════
    // LESSON PROGRESS
    // ════════════════════════════════════════

    // Mark lesson as watched (protected)
    app.post('/lesson-progress/watch', verifyJWT, async (req, res) => {
      try {
        const { userEmail, courseId, lessonId } = req.body
        if (req.tokenEmail !== userEmail) return res.status(403).send({ message: 'Forbidden' })
        await lessonProgressCollection.updateOne(
          { userEmail, courseId, lessonId },
          { $set: { userEmail, courseId, lessonId, watched: true, watchedAt: new Date() } },
          { upsert: true }
        )
        res.send({ success: true })
      } catch (err) {
        res.status(500).send({ message: 'Error saving progress' })
      }
    })

    // Mark lesson as completed (protected)
    app.post('/lesson-progress/complete', verifyJWT, async (req, res) => {
      try {
        const { userEmail, courseId, lessonId } = req.body
        if (req.tokenEmail !== userEmail) return res.status(403).send({ message: 'Forbidden' })
        await lessonProgressCollection.updateOne(
          { userEmail, courseId, lessonId },
          { $set: { completed: true, completedAt: new Date() } },
          { upsert: true }
        )
        res.send({ success: true })
      } catch (err) {
        res.status(500).send({ message: 'Error completing lesson' })
      }
    })

    // Get lesson progress (protected)
    app.get('/lesson-progress/:userEmail/:courseId', verifyJWT, async (req, res) => {
      try {
        const { userEmail, courseId } = req.params
        if (req.tokenEmail !== userEmail) return res.status(403).send({ message: 'Forbidden' })
        const progress = await lessonProgressCollection.find({ userEmail, courseId }).toArray()
        res.send(progress)
      } catch (err) {
        res.status(500).send({ message: 'Error fetching progress' })
      }
    })

    // Reset course progress (protected)
    app.delete('/lesson-progress/:userEmail/:courseId', verifyJWT, async (req, res) => {
      try {
        const { userEmail, courseId } = req.params
        if (req.tokenEmail !== userEmail) return res.status(403).send({ message: 'Forbidden' })
        await lessonProgressCollection.deleteMany({ userEmail, courseId })
        await quizResultsCollection.deleteMany({ userEmail, courseId })
        res.send({ success: true })
      } catch (err) {
        res.status(500).send({ message: 'Error resetting progress' })
      }
    })

    // ════════════════════════════════════════
    // QUIZ RESULTS
    // ════════════════════════════════════════

    // Save quiz result (protected)
    app.post('/quiz-results', verifyJWT, async (req, res) => {
      try {
        const { userEmail, courseId, lessonId, quizId, score, total, passed } = req.body
        if (req.tokenEmail !== userEmail) return res.status(403).send({ message: 'Forbidden' })
        const existing = await quizResultsCollection.findOne({ userEmail, lessonId })
        if (existing && existing.score >= score) return res.send({ success: true, message: 'Previous score was better' })
        await quizResultsCollection.updateOne(
          { userEmail, lessonId },
          { $set: { userEmail, courseId, lessonId, quizId, score, total, passed, attemptedAt: new Date() } },
          { upsert: true }
        )
        res.send({ success: true })
      } catch (err) {
        res.status(500).send({ message: 'Error saving quiz result' })
      }
    })

    // Get quiz results (protected)
    app.get('/quiz-results/:userEmail/:courseId', verifyJWT, async (req, res) => {
      try {
        const { userEmail, courseId } = req.params
        if (req.tokenEmail !== userEmail) return res.status(403).send({ message: 'Forbidden' })
        const results = await quizResultsCollection.find({ userEmail, courseId }).toArray()
        res.send(results)
      } catch (err) {
        res.status(500).send({ message: 'Error fetching quiz results' })
      }
    })

    // ════════════════════════════════════════
    // REVIEW ROUTES
    // ════════════════════════════════════════

    // Get reviews for a course (public)
    app.get('/reviews/:courseId', async (req, res) => {
      try {
        const reviews = await reviewsCollection
          .find({ courseId: req.params.courseId })
          .sort({ updatedAt: -1 })
          .toArray()
        res.send(reviews)
      } catch (err) {
        res.status(500).send({ message: 'Error fetching reviews' })
      }
    })

    // Save review (protected)
    app.post('/reviews', verifyJWT, async (req, res) => {
      try {
        const review = req.body
        if (req.tokenEmail !== review.userEmail) return res.status(403).send({ message: 'Forbidden' })
        await reviewsCollection.updateOne(
          { userEmail: review.userEmail, courseId: review.courseId },
          { $set: { ...review, updatedAt: new Date() } },
          { upsert: true }
        )
        res.status(201).send({ success: true })
      } catch (err) {
        res.status(500).send({ message: 'Error saving review' })
      }
    })

    // ════════════════════════════════════════
    // ADMIN ROUTES
    // ════════════════════════════════════════

    // Stats (admin only)
    app.get('/admin/stats', verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const [users, courses, enrollments, reviews] = await Promise.all([
          usersCollection.countDocuments(),
          coursesCollection.countDocuments(),
          enrollmentsCollection.countDocuments(),
          reviewsCollection.countDocuments(),
        ])
        res.send({ users, courses, enrollments, reviews })
      } catch (err) {
        res.status(500).send({ message: 'Error fetching stats' })
      }
    })

    // Get all users (admin only)
    app.get('/admin/users', verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const users = await usersCollection.find({}).sort({ _id: -1 }).toArray()
        res.send(users)
      } catch (err) {
        res.status(500).send({ message: 'Error fetching users' })
      }
    })

    // Update user role (admin only)
    app.patch('/admin/users/:email/role', verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const result = await usersCollection.updateOne(
          { email: req.params.email }, { $set: { role: req.body.role } }
        )
        res.send(result)
      } catch (err) {
        res.status(500).send({ message: 'Error updating role' })
      }
    })

    // Delete user + cascade (admin only)
    app.delete('/admin/users/:email', verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const { email } = req.params
        await usersCollection.deleteOne({ email })
        await enrollmentsCollection.deleteMany({ userEmail: email })
        await lessonProgressCollection.deleteMany({ userEmail: email })
        await quizResultsCollection.deleteMany({ userEmail: email })
        res.send({ success: true })
      } catch (err) {
        res.status(500).send({ message: 'Error deleting user' })
      }
    })

    // Get all reviews (admin only)
    app.get('/admin/reviews', verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const reviews = await reviewsCollection.find({}).sort({ updatedAt: -1 }).toArray()
        res.send(reviews)
      } catch (err) {
        res.status(500).send({ message: 'Error fetching reviews' })
      }
    })

    // Delete review (admin only)
    app.delete('/admin/reviews/:id', verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const result = await reviewsCollection.deleteOne({ _id: new ObjectId(req.params.id) })
        res.send(result)
      } catch (err) {
        res.status(500).send({ message: 'Error deleting review' })
      }
    })

    // Analytics (admin only)
    app.get('/admin/analytics', verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const topCourses = await enrollmentsCollection.aggregate([
          { $group: { _id: '$courseId', count: { $sum: 1 }, title: { $first: '$courseTitle' } } },
          { $sort: { count: -1 } },
          { $limit: 5 }
        ]).toArray()
        const quizStats = await quizResultsCollection.aggregate([
          { $group: { _id: '$courseId', total: { $sum: 1 }, passed: { $sum: { $cond: ['$passed', 1, 0] } }, avgScore: { $avg: { $multiply: [{ $divide: ['$score', '$total'] }, 100] } } } },
        ]).toArray()
        res.send({ topCourses, quizStats })
      } catch (err) {
        res.status(500).send({ message: 'Error fetching analytics' })
      }
    })

    await client.db('admin').command({ ping: 1 })
    console.log('Pinged your deployment. You successfully connected to MongoDB!')
  } finally {
    // keep connection alive
  }
}
run().catch(console.dir)

app.get('/', (req, res) => res.send('Hello from Server..'))

app.listen(port, () => console.log(`Server is running on port ${port}`))
