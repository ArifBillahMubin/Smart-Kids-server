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
        const filter = { _id: new ObjectId(id) };
        const result = await coursesCollection.deleteOne(filter);
        res.send(result);
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
