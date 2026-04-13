require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const admin = require('firebase-admin')
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
    origin: [
      'http://localhost:5173',
      'http://localhost:5174',
      'https://b12-m11-session.web.app',
    ],
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
