const express = require('express');
const app = express();
const fs = require('fs');
const path = require('path');

const session = require('express-session');
const cookieParser = require('cookie-parser');
const FileStore = require('session-file-store')(session);
const MySQLStore = require("express-mysql-session")(session);
const bcrypt = require('bcrypt');


const methodOverride = require('method-override');

const { MongoClient, ObjectId } = require('mongodb');
const mysql = require('mysql2');


// const passport = require('passport');
// const LocalStrategy = require('passport-local');



// 로그인 세션
const sessionMiddleware = session({
  secret : '암호화에 쓸 비번',
  resave : false,
  saveUninitialized : false,
  store : new MySQLStore({
    host : 'localhost',
    port : 3306,  
    user : 'root',
    password : '96rud38gms!',
    database : 'donuts',
    createDatabaseTable: true,
    expiration : 1000 * 60 * 60 * 1,
    clearExpired : true,
    checkExpirationInterval : 1000 * 60 * 5,
    tableName: 'sessions',
  }),
});
app.use(sessionMiddleware)  // 이 위치에서 아래 use들이 작동
// app.use(passport.initialize());
// app.use(passport.session());


app.use(methodOverride('_method'));
app.set('view engine', 'ejs');
app.use(express.static(__dirname + '/public'));
app.use(express.json());
app.use(express.urlencoded({extended: true}));



// mysql db연결
const connection = mysql.createConnection({
  host : 'localhost',  
  user : 'root',
  password : '96rud38gms!',
  database : 'donuts'
  });
  
  connection.connect(function(err) {
    if (err) {
      console.error('연결실패 :' + err.stack);
      return;
    }
    console.log('MySql connection');
  });


// mongodb 연결
let db;
const url = 'mongodb+srv://dodonuts:96rud38gms@cluster0.g0kttaw.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0'
new MongoClient(url).connect().then((client) => {
  console.log('MongoDB Connection');
  db = client.db('project1');
}).catch((err) => {
  console.log(err);
});

// 서버 연결
app.listen(8080, () => {
  console.log('http://localhost:8080 연결중');
});

// 메인페이지
app.get('/', (req, res) => {
  console.log('메인페이지 접속')
  console.log(req.session);
  console.log(req.session.user_id)
  if (req.session.is_logined == true) {
    res.render('main.ejs', {
      user_id : req.session.user_id
    })
    console.log('로그인 되었습니다.')
  } else {
    console.log('로그인이 필요합니다.')
    res.render('main.ejs',{
      is_logined : false,
      user_id : null,
      user_pw : null
    });
  }  
});

// 메모장 접속
app.get('/memo', async (req, res) => {
  let result = await db.collection('memo').find().sort({ _id : -1 }).toArray(); // sort : 내림차순으로 메모 보여줌(최신순)
  res.render('memo.ejs', {memo : result});
});

// 메모 작성
app.post('/memo/write', async (req, res) => {
  console.log(req.body);
  await db.collection('memo').insertOne({
    title : req.body.title,
    content : req.body.content,
    days : new Date().toLocaleString()
  })
});

// 메모 저장 즉시 출력
app.get('/memo/stream', (req, res) => {
  res.writeHead(200, {
    "Connection" : "keep-alive",
    "Content-Type" : "text/event-stream",
    "Cache-Control" : "no-cache",
  });
  
  let condition = [
    { $match : { operationType : 'insert' } }
  ]
  let changeStream = db.collection('memo').watch(condition);
  changeStream.on('change', (result) => {
    console.log(result)
    res.write('event: msg\n');
    res.write(`data: ${JSON.stringify(result.fullDocument)}\n\n`)
  });
  
});

// 메모 삭제
app.delete('/memo/delete', async (req, res) => {
  await db.collection('memo').deleteOne({
    _id : new ObjectId(req.body.id)
  })
  res.send('삭제완료');
});

// 메모 수정(수정한 메모 db 저장)
app.post('/memo/update', async (req, res) => {
  console.log(req.body);
  await db.collection('memo').updateOne(
    { _id : new ObjectId(req.body.id)},
    { $set : { title : req.body.title, content : req.body.content} }
  );
  res.send('수정 완료');
});


// 회원 필드(mysql)
app.get('/register', async (req, res) => {
  res.render('register.ejs');
});

app.post('/register/req', async (req, res) => {
  const userId = req.body.userid;
  const hashPw = await bcrypt.hash(req.body.userpw, 10);
  const email = req.body.email
  
  if (userId && hashPw && email ) {
    connection.query(
      'SELECT * FROM donuts.user WHERE user_id = ? AND user_pw = ? AND email = ?',
      [userId, hashPw, email], 
      (err, data, fields) => {
        if (err) throw err;
        if (data.length <= 0 && req.body.userpw == req.body.userpw2) {
          connection.query(
            'INSERT INTO donuts.user (user_id, user_pw, email) VALUES (?, ?, ?)',
            [userId, hashPw, email],
            (err, result) => {
              if (err) {
                console.log(err);
                return;
              } else {
                console.log(result);
                res.send('<script type="text/javascript">alert("회원가입을 환영합니다!"); document.location.href="/login";</script>');
              }
            }
          )
        } else if (req.body.userpw != req.body.userpw2) {
          res.send('<script type="text/javascript">alert("입력된 비밀번호가 서로 다릅니다."); document.location.href="/register";</script>');
        } else {
          res.send('<script type="text/javascript">alert("이미 존재하는 아이디 입니다."); document.location.href="/register";</script>');
        }
      }
    )
  } else {
    res.send('<script type="text/javascript">alert("모든 정보를 입력하세요"); document.location.href="/register";</script>');    
  }
});



app.get('/login', async (req, res) => {
  res.render('login.ejs');
});

app.post('/login/req', async (req, res) => {
  const body = req.body;
  const id = body.userid;
  const pw = body.userpw

  connection.query(
    'SELECT * FROM donuts.user WHERE user_id = ?',
    [id], (err, result) => {
      console.log(result);
      if (result.length > 0) {
        const user = result[0];
        bcrypt.compare(pw, user.user_pw, (err, compareResult) => {
          if (compareResult) {
            console.log('로그인 성공');
            console.log(result[0].user_id)
            // 세션 추가
            req.session.is_logined = true;
            req.session.user_id = result[0].user_id;
            req.session.save(function () {
              res.render('main.ejs', {
                id_logined : true,
                user_id : req.session.user_id
              
              });
            });
            res.redirect('/')
          } else {
            console.log('비밀번호 불일치')
          }
        });
      } else {
        console.log('존재하지 않는 아이디');
      }
  });
});

app.get('/logout', async (req, res) => {
  console.log('로그아웃 성공');
  req.session.destroy(function (err) {
    res.redirect('/');
  });
});


// 게시물 필드(mysql)
app.get('/post/write', async (req, res) => {
  res.render('write.ejs');
});

app.post('/post/write/add', async (req, res) => {
  const title = req.body.title;
  const content = req.body.content;
  const date = new Date().toLocaleString().slice(0, -3);
  console.log(req.body)

  connection.query(
    'INSERT INTO donuts.post (title, content, date) VALUES (?, ?, ?)',
    [title, content, date],
    (err, result) => {
      if (err) {
        console.error(err);
        res.status(500).send('데이터 저장 실패');
        return;
      }
      console.log('데이터 저장 성공');
      res.redirect('/post/list');
    }
  );
});

app.get('/post/list', async (req, res) => {
  connection.query(
    'SELECT * FROM donuts.post ORDER BY id DESC',
    (err, result) => {
      if (err) {
        console.error(err);
        res.status(500).send('불러오기 실패');
        return;
      }
      console.log('불러오기 성공');
      res.render('list.ejs', {result : result});
    }
  );
});

app.get('/post/detail/:id', async (req, res) => {
  let postId = req.params.id;
  console.log(postId)
  connection.query(
    'SELECT * FROM donuts.post WHERE id = ?',
    [postId],
    (err, result) => {
      if (err) {
        console.error(err);
        res.status(500).send('불러오기 실패');
        return;
      } 
      console.log('불러오기 성공');
      res.render('detail.ejs', {result : result});
    }
  )
});

app.delete('/post/delete', async (req, res) => {
  const docId = req.query.docId;

  const query = `DELETE FROM donuts.post WHERE id = ?`;

  connection.query(query, [docId], (err, result) => {
    if (err) {
      console.error(err);
      res.status(500).send('삭제 실패');
      return;
    }

    console.log('삭제 완료');
    res.send('삭제 완료');
  });
  
});

app.get('/post/edit/:id', async (req, res) => {
  const postId = req.params.id;
  console.log(postId);
  connection.query(
    'SELECT * FROM donuts.post WHERE id = ?',
    [postId],
    (err, result) => {
      if (err) {
        console.error(err);
        res.status(500).send('불러오기 실패');
        return;
      }
      console.log('불러오기 성공');
      res.render('edit.ejs', {result : result});
    }
  );
});

app.post('/editpost/:id', async (req, res) => {
  const editId = req.params.id;
  const editTitle = req.body.title;
  const editContent = req.body.content;
  const editDate = new Date().toLocaleString().slice(0, -3);
  const query = `UPDATE donuts.post SET title = ?, content = ?, date = ? WHERE id = ?`;

  connection.query(query, [editTitle, editContent, editDate, editId], (err, result) => {
    if (err) {
      console.error(err);
      res.status(500).send('삭제 실패');
      return;
    }
    console.log('수정 완료');
    res.redirect('/post/list');
  });
})


