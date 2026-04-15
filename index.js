require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const admin = require('firebase-admin')
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const port = process.env.PORT || 3000
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString(
  'utf-8'
)
const serviceAccount = JSON.parse(decoded)
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})

const app = express()
// middleware
app.use(
  cors({
    origin: [process.env.DOMAIN_URL],
    credentials: true,
    optionSuccessStatus: 200,
  })
)
app.use(express.json())

// jwt middlewares
const verifyJWT = async (req, res, next) => {
  const token = req?.headers?.authorization?.split(' ')[1]
  console.log(token)
  if (!token) return res.status(401).send({ message: 'Unauthorized Access!' })
  try {
    const decoded = await admin.auth().verifyIdToken(token)
    req.tokenEmail = decoded.email
    console.log(decoded)
    next()
  } catch (err) {
    console.log(err)
    return res.status(401).send({ message: 'Unauthorized Access!', err })
  }
}

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})

async function run() {
  try {
    const db = client.db('smart_kids')
    const coursesCollection = db.collection('courses')
    const usersCollection = db.collection('users')
    const enrollmentsCollection = db.collection('enrollments');
    const lessonsCollection = db.collection('lessons');
    const quizzesCollection = db.collection('quizzes');
    const lessonProgressCollection = db.collection('lesson_progress');
    const quizResultsCollection = db.collection('quiz_results');
    const reviewsCollection = db.collection('reviews');



    // save and add course 
    app.post('/courses', async (req, res) => {
      try {
        const course = req.body
        const result = await coursesCollection.insertOne(course)
        res.status(201).send(result)
      } catch (error) {
        console.error(error)
        res.status(500).send({ message: 'Error adding course' })
      }
    })

    //get all course
    app.get('/course', async (req, res) => {
      try {
        const courses = await coursesCollection.find({}).toArray()
        res.status(200).send(courses)
      } catch (error) {
        console.error(error)
        res.status(500).send({ message: 'Error fetching courses' })
      }
    }
    )

    //get one course by id
    app.get('/course/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const course = await coursesCollection.findOne({ _id: new ObjectId(id) });
        res.send(course);
      } catch (error) {
        res.status(500).send({ message: 'Error fetching course' });
      }
    });

    // delete course
    app.delete('/course/:id', async (req, res) => {
      try {
        const id = req.params.id;

        // 1. Get all lessons for this course
        const lessons = await lessonsCollection
          .find({ courseId: id })
          .toArray();

        const lessonIds = lessons.map(l => l._id.toString());

        // 2. Delete all quizzes for each lesson
        if (lessonIds.length > 0) {
          await quizzesCollection.deleteMany({ lessonId: { $in: lessonIds } });
        }

        // 3. Delete all lessons
        await lessonsCollection.deleteMany({ courseId: id });

        // 4. Delete all enrollments
        await enrollmentsCollection.deleteMany({ courseId: id });

        // 5. Delete lesson progress        
        await lessonProgressCollection.deleteMany({ courseId: id });

        // 6. Delete quiz results           
        await quizResultsCollection.deleteMany({ courseId: id });

        // 7. Finally delete the course
        const result = await coursesCollection.deleteOne({ _id: new ObjectId(id) });

        res.send({
          success: true,
          deletedCourse: result.deletedCount,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Error deleting course' });
      }
    });

    //update course
    app.put('/course/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const courseData = req.body;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            emoji: courseData.emoji,
            title: courseData.title,
            titleBn: courseData.titleBn,
            subject: courseData.subject,
            subjectBn: courseData.subjectBn,
            class: courseData.class,
            classBn: courseData.classBn,
            level: courseData.level,
            levelBn: courseData.levelBn,
            duration: courseData.duration,
            durationBn: courseData.durationBn,
            lessons: courseData.lessons,
            quizzes: courseData.quizzes,
            color: courseData.color,
            badge: courseData.badge,
            price: courseData.price,
            priceBn: courseData.priceBn,
            priceAmount: courseData.priceAmount,
            instructor: courseData.instructor,
            instructorBn: courseData.instructorBn,
            instructorRole: courseData.instructorRole,
            instructorRoleBn: courseData.instructorRoleBn,
            description: courseData.description,
            descriptionBn: courseData.descriptionBn,
            whatYouLearn: courseData.whatYouLearn,
            whatYouLearnBn: courseData.whatYouLearnBn,
            curriculum: courseData.curriculum,
            requirements: courseData.requirements,
            requirementsBn: courseData.requirementsBn,
            tags: courseData.tags,
            status: courseData.status,
          },
        };
        const result = await coursesCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Error updating course' });
      }
    });


    // user 

    // Save or update user
    app.post('/users', async (req, res) => {
      try {
        const user = req.body;
        // Check if user already exists
        const existing = await usersCollection.findOne({ email: user.email });
        if (existing) {
          return res.send({ message: 'User already exists', insertedId: null });
        }
        const result = await usersCollection.insertOne(user);
        res.status(201).send(result);
      } catch (error) {
        res.status(500).send({ message: 'Error saving user' });
      }
    });

    // Get user by email (to check role)
    app.get('/users/:email', async (req, res) => {
      try {
        const { email } = req.params;
        const user = await usersCollection.findOne({ email });
        res.send(user);
      } catch (error) {
        res.status(500).send({ message: 'Error fetching user' });
      }
    });

    // Update user profile
    app.put('/users/:email', async (req, res) => {
      try {
        const { email } = req.params;
        const updateData = req.body;
        const result = await usersCollection.updateOne(
          { email },
          { $set: updateData }
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Error updating user' });
      }
    });





    // ═══════════════════════════════════════════════════
    // ENROLLMENT & PAYMENT ROUTES
    // ═══════════════════════════════════════════════════

    // Free enrollment
    app.post('/enrollments', async (req, res) => {
      try {
        const { courseId, courseTitle, userEmail, userName } = req.body;
        const existing = await enrollmentsCollection.findOne({ courseId, userEmail });
        if (existing) return res.send({ success: true, message: 'Already enrolled' });
        const result = await enrollmentsCollection.insertOne({
          courseId, courseTitle, userEmail, userName,
          payment: false, enrolledAt: new Date()
        });
        await coursesCollection.updateOne(
          { _id: new ObjectId(courseId) }, { $inc: { enrolled: 1 } }
        );
        res.status(201).send({ success: true, insertedId: result.insertedId });
      } catch (err) {
        res.status(500).send({ message: 'Error saving enrollment' });
      }
    });

    // Get enrollments by email
    app.get('/enrollments/:email', async (req, res) => {
      try {
        const data = await enrollmentsCollection
          .find({ userEmail: req.params.email }).toArray();
        res.send(data);
      } catch (err) {
        res.status(500).send({ message: 'Error fetching enrollments' });
      }
    });

    // Create Stripe checkout session
    app.post('/create-checkout-session', async (req, res) => {
      try {
        const { courseId, courseTitle, description, priceAmount, userEmail, userName } = req.body;
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
        });
        res.send({ url: session.url });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: 'Error creating checkout session' });
      }
    });

    // Payment success — verify & save
    app.post('/payment-success', async (req, res) => {
      console.log('BODY:', req.body);
      try {
        const { sessionId } = req.body;
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        //
        console.log('=== METADATA ===', session.metadata);

        if (session.payment_status !== 'paid') {
          return res.send({ success: false, message: 'Payment not completed' });
        }
        const { courseId, courseTitle, userEmail, userName } = session.metadata;
        const existing = await enrollmentsCollection.findOne({ courseId, userEmail });
        if (existing) {
          return res.send({
            success: true, message: 'Already enrolled',
            enrollmentId: existing._id, transactionId: session.payment_intent
          });
        }
        const result = await enrollmentsCollection.insertOne({
          courseId, courseTitle, userEmail, userName,
          payment: true,
          transactionId: session.payment_intent,
          paymentDate: new Date(),
          enrolledAt: new Date()
        });
        await coursesCollection.updateOne(
          { _id: new ObjectId(courseId) }, { $inc: { enrolled: 1 } }
        );
        res.send({
          success: true,
          message: 'Payment successful & enrolled',
          enrollmentId: result.insertedId,
          transactionId: session.payment_intent
        });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: 'Error processing payment' });
      }
    });



    // ════════════════════════════════════════
    // LESSON ROUTES
    // ════════════════════════════════════════

    // Add lesson
    app.post('/lessons', async (req, res) => {
      try {
        const lesson = req.body;
        const result = await lessonsCollection.insertOne({
          ...lesson,
          createdAt: new Date()
        });
        res.status(201).send(result);
      } catch (err) {
        res.status(500).send({ message: 'Error adding lesson' });
      }
    });

    // Get all lessons for a course
    app.get('/lessons/:courseId', async (req, res) => {
      try {
        const lessons = await lessonsCollection
          .find({ courseId: req.params.courseId })
          .sort({ weekIndex: 1, order: 1 })
          .toArray();
        res.send(lessons);
      } catch (err) {
        res.status(500).send({ message: 'Error fetching lessons' });
      }
    });

    // Update lesson
    app.put('/lessons/:id', async (req, res) => {
      try {
        const result = await lessonsCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: req.body }
        );
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: 'Error updating lesson' });
      }
    });

    // Delete lesson
    app.delete('/lessons/:id', async (req, res) => {
      try {
        const result = await lessonsCollection.deleteOne(
          { _id: new ObjectId(req.params.id) }
        );
        // Also delete related quizzes
        await quizzesCollection.deleteMany({ lessonId: req.params.id });
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: 'Error deleting lesson' });
      }
    });

    // ════════════════════════════════════════
    // QUIZ ROUTES
    // ════════════════════════════════════════

    // Add quiz to a lesson
    app.post('/quizzes', async (req, res) => {
      try {
        const quiz = req.body;
        const result = await quizzesCollection.insertOne({
          ...quiz,
          createdAt: new Date()
        });
        res.status(201).send(result);
      } catch (err) {
        res.status(500).send({ message: 'Error adding quiz' });
      }
    });

    // Get quiz by lessonId
    app.get('/quizzes/:lessonId', async (req, res) => {
      try {
        const quiz = await quizzesCollection.findOne(
          { lessonId: req.params.lessonId }
        );
        res.send(quiz || null);
      } catch (err) {
        res.status(500).send({ message: 'Error fetching quiz' });
      }
    });

    // Get all quizzes for a course
    app.get('/quizzes/course/:courseId', async (req, res) => {
      try {
        const quizzes = await quizzesCollection
          .find({ courseId: req.params.courseId })
          .toArray();
        res.send(quizzes);
      } catch (err) {
        res.status(500).send({ message: 'Error fetching quizzes' });
      }
    });

    // Update quiz
    app.put('/quizzes/:id', async (req, res) => {
      try {
        const result = await quizzesCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: req.body }
        );
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: 'Error updating quiz' });
      }
    });

    // Delete quiz
    app.delete('/quizzes/:id', async (req, res) => {
      try {
        const result = await quizzesCollection.deleteOne(
          { _id: new ObjectId(req.params.id) }
        );
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: 'Error deleting quiz' });
      }
    });




    // ════════════════════════════════════════
    // LESSON PROGRESS
    // ════════════════════════════════════════

    // Mark lesson as watched
    app.post('/lesson-progress/watch', async (req, res) => {
      try {
        const { userEmail, courseId, lessonId } = req.body;
        await lessonProgressCollection.updateOne(
          { userEmail, courseId, lessonId },
          { $set: { userEmail, courseId, lessonId, watched: true, watchedAt: new Date() } },
          { upsert: true }
        );
        res.send({ success: true });
      } catch (err) {
        res.status(500).send({ message: 'Error saving progress' });
      }
    });

    // Mark lesson as completed (video + quiz done)
    app.post('/lesson-progress/complete', async (req, res) => {
      try {
        const { userEmail, courseId, lessonId } = req.body;
        await lessonProgressCollection.updateOne(
          { userEmail, courseId, lessonId },
          { $set: { completed: true, completedAt: new Date() } },
          { upsert: true }
        );
        res.send({ success: true });
      } catch (err) {
        res.status(500).send({ message: 'Error completing lesson' });
      }
    });

    // Get all progress for a user in a course
    app.get('/lesson-progress/:userEmail/:courseId', async (req, res) => {
      try {
        const { userEmail, courseId } = req.params;
        const progress = await lessonProgressCollection
          .find({ userEmail, courseId })
          .toArray();
        res.send(progress);
      } catch (err) {
        res.status(500).send({ message: 'Error fetching progress' });
      }
    });

    // ════════════════════════════════════════
    // QUIZ RESULTS
    // ════════════════════════════════════════

    // Save quiz result
    app.post('/quiz-results', async (req, res) => {
      try {
        const { userEmail, courseId, lessonId, quizId, score, total, passed } = req.body;
        // Keep best score
        const existing = await quizResultsCollection.findOne({ userEmail, lessonId });
        if (existing && existing.score >= score) {
          return res.send({ success: true, message: 'Previous score was better' });
        }
        await quizResultsCollection.updateOne(
          { userEmail, lessonId },
          { $set: { userEmail, courseId, lessonId, quizId, score, total, passed, attemptedAt: new Date() } },
          { upsert: true }
        );
        res.send({ success: true });
      } catch (err) {
        res.status(500).send({ message: 'Error saving quiz result' });
      }
    });

    // Get quiz results for a user in a course
    app.get('/quiz-results/:userEmail/:courseId', async (req, res) => {
      try {
        const { userEmail, courseId } = req.params;
        const results = await quizResultsCollection
          .find({ userEmail, courseId })
          .toArray();
        res.send(results);
      } catch (err) {
        res.status(500).send({ message: 'Error fetching quiz results' });
      }
    });


    // Reset lesson progress for a course
    app.delete('/lesson-progress/:userEmail/:courseId', async (req, res) => {
      try {
        const { userEmail, courseId } = req.params;
        await lessonProgressCollection.deleteMany({ userEmail, courseId });
        await quizResultsCollection.deleteMany({ userEmail, courseId });
        res.send({ success: true });
      } catch (err) {
        res.status(500).send({ message: 'Error resetting progress' });
      }
    });

    // Save review
    app.post('/reviews', async (req, res) => {
      try {
        const review = req.body;
        // One review per user per course
        await reviewsCollection.updateOne(
          { userEmail: review.userEmail, courseId: review.courseId },
          { $set: { ...review, updatedAt: new Date() } },
          { upsert: true }
        );
        res.status(201).send({ success: true });
      } catch (err) {
        res.status(500).send({ message: 'Error saving review' });
      }
    });

    // Get reviews for a course
    app.get('/reviews/:courseId', async (req, res) => {
      try {
        const reviews = await reviewsCollection
          .find({ courseId: req.params.courseId })
          .sort({ updatedAt: -1 })
          .toArray();
        res.send(reviews);
      } catch (err) {
        res.status(500).send({ message: 'Error fetching reviews' });
      }
    });




    //admin dashboard 
    // ── Admin Stats ──
    app.get('/admin/stats', async (req, res) => {
      try {
        const [users, courses, enrollments, reviews] = await Promise.all([
          usersCollection.countDocuments(),
          coursesCollection.countDocuments(),
          enrollmentsCollection.countDocuments(),
          reviewsCollection.countDocuments(),
        ]);
        const revenue = await enrollmentsCollection.aggregate([
          { $match: { payment: true } },
          { $lookup: { from: 'courses', localField: 'courseId', foreignField: '_id', as: 'course' } },
        ]).toArray();
        res.send({ users, courses, enrollments, reviews });
      } catch (err) {
        res.status(500).send({ message: 'Error fetching stats' });
      }
    });

    // ── Get all users ──
    app.get('/admin/users', async (req, res) => {
      try {
        const users = await usersCollection.find({}).sort({ _id: -1 }).toArray();
        res.send(users);
      } catch (err) {
        res.status(500).send({ message: 'Error fetching users' });
      }
    });

    // ── Update user role ──
    app.patch('/admin/users/:email/role', async (req, res) => {
      try {
        const { role } = req.body;
        const result = await usersCollection.updateOne(
          { email: req.params.email },
          { $set: { role } }
        );
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: 'Error updating role' });
      }
    });

    // ── Delete user ──
    app.delete('/admin/users/:email', async (req, res) => {
      try {
        const { email } = req.params;
        await usersCollection.deleteOne({ email });
        await enrollmentsCollection.deleteMany({ userEmail: email });
        await lessonProgressCollection.deleteMany({ userEmail: email });
        await quizResultsCollection.deleteMany({ userEmail: email });
        res.send({ success: true });
      } catch (err) {
        res.status(500).send({ message: 'Error deleting user' });
      }
    });

    // ── Get all reviews ──
    app.get('/admin/reviews', async (req, res) => {
      try {
        const reviews = await reviewsCollection.find({}).sort({ updatedAt: -1 }).toArray();
        res.send(reviews);
      } catch (err) {
        res.status(500).send({ message: 'Error fetching reviews' });
      }
    });

    // ── Delete review ──
    app.delete('/admin/reviews/:id', async (req, res) => {
      try {
        const result = await reviewsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: 'Error deleting review' });
      }
    });

    // ── Admin analytics ──
    app.get('/admin/analytics', async (req, res) => {
      try {
        const topCourses = await enrollmentsCollection.aggregate([
          { $group: { _id: '$courseId', count: { $sum: 1 }, title: { $first: '$courseTitle' } } },
          { $sort: { count: -1 } },
          { $limit: 5 }
        ]).toArray();

        const quizStats = await quizResultsCollection.aggregate([
          { $group: { _id: '$courseId', total: { $sum: 1 }, passed: { $sum: { $cond: ['$passed', 1, 0] } }, avgScore: { $avg: { $multiply: [{ $divide: ['$score', '$total'] }, 100] } } } },
        ]).toArray();

        res.send({ topCourses, quizStats });
      } catch (err) {
        res.status(500).send({ message: 'Error fetching analytics' });
      }
    });




    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 })
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    )
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir)

app.get('/', (req, res) => {
  res.send('Hello from Server..')
})

app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})
