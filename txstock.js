/*
腾讯自选股APP & 微信微证券公众号
改自@CenBoMin大佬的脚本
只适配了IOS，测试了青龙和V2P，其他平台请自行测试，安卓请自行测试
多账户用#隔开

脚本只会在10点到13点之间进行猜涨跌，请务必在这段时间内跑一次脚本，猜涨跌开奖时间为15:15
有些任务会提示任务完成发奖失败 -- 可以忽略
或者任务完成前置条件不符合 -- 待解决

内置了多账户相互做分享任务，账户数多于一个才能用
测试了做分享任务的情况下，一天收益大概在15000金币
默认自动提现5元，做分享任务，不做新手任务
新手任务可能需要跑几次才能做完，不过每天跑的话总会做完的

提现条件设置：自己新建一个TxStockCash环境变量，0代表不提现，1代表提现1元，5代表提现5元
分享任务设置：新建一个TxStockHelp环境变量，0代表不做分享互助，1代表做分享互助
新手任务设置：新建一个TxStockNewbie环境变量，0代表不做新手任务，1代表做新手任务


青龙：
APP和微信都捉 https://wzq.tenpay.com/cgi-bin/activity_task_daily.fcgi? 开头的包，点击获取金币，看到任务应该就能捉到
APP捉包把整个URL放进去TxStockAppUrl，header转成JSON字符串之后放进去TxStockAppHeader
微信微证券公众号捉包后header转成JSON字符串之后放进去TxStockWxHeader
export TxStockAppUrl='https://wzq.ten....#https://wzq.ten....#https://wzq.ten....'
export TxStockAppHeader='{"Host":"...","Accept":"...",...}#{"Host":"...","Accept":"...",...}#{"Host":"...","Accept":"...",...}'
export TxStockWxHeader='{"Host":"...","Accept":"...",...}#{"Host":"...","Accept":"...",...}#{"Host":"...","Accept":"...",...}'

重写食用
TxStockAppUrl与TxStockAppHeader：打开APP，点击头像->右上角金币->获取金币
TxStockWxHeader：打开 腾讯自选股微信版|微证券 公众号，右下角好福利->福利中心

V2P：
重写: https://wzq.tenpay.com/cgi-bin/activity_task_daily.fcgi?   https://raw.githubusercontent.com/leafxcy/JavaScript/main/txstock.js
MITM: wzq.tenpay.com

圈X：
[task_local]
#腾讯自选股
16 12,15 * * * txstock.js, tag=腾讯自选股, enabled=true
[rewrite_local]
#获取APP和微信微证券的URL和header
https://wzq.tenpay.com/cgi-bin/activity_task_daily.fcgi? url script-request-header https://raw.githubusercontent.com/leafxcy/JavaScript/main/txstock.js
[MITM]
hostname = wzq.tenpay.com

*/

const jsname = '腾讯自选股'
const $ = Env(jsname)
const notifyFlag = 1; //0为关闭通知，1为打开通知,默认为1

let sessionTime = Math.round(new Date().getTime())
let rndtime = "" //毫秒
let todayDate = formatDateTime(new Date());
var cash = ($.isNode() ? (process.env.TxStockCash) : ($.getval('TxStockCash'))) || 5; //0为不自动提现,1为自动提现1元,5为自动提现5元
var help = ($.isNode() ? (process.env.TxStockHelp) : ($.getval('TxStockHelp'))) || 1; //0为不做分享助力任务，1为多账户互相分享助力
var newbie = ($.isNode() ? (process.env.TxStockNewbie) : ($.getval('TxStockNewbie'))) || 0; //0为不做新手任务，1为自动做新手任务

const appUrlArr = [];
let appUrlArrVal = "";

const appHeaderArr = [];
let appHeaderArrVal = "";

const wxHeaderArr = [];
let wxHeaderArrVal = "";

let rewardCoin = 0
let coinStart = []
let coinEnd = []
let coinInfo = ""
let notifyStr = ""

let numUser = 0
let totalUser = 0
let shareFlag = 0 //账号数多于1且打开助力开关，才会做助力任务
let helpUser = 0
let scanList = []
let nickname = []
let bullStatusFlag = []

let appShareFlag = 1
let wxShareFlag = 1
let appTaskFlag = 1
let wxTaskFlag = 1
let bullishFlag = 1
let bullHelpFlag = 0

let logDebug = 0

let userAppShareTaskList = {
    "daily": ["news_share", "task_50_1111", "task_51_1111", "task_72_1113", "task_74_1113", ],
    "newbie": [],
    
}
let userAppShareCodeArr = {
    "daily": {},
    "newbie": {},
    "bull_invite": [],
    "bull_help": [],
    "guess_invite": [],
    "guess_ticket": [],
    "guess_time": [],
}

let userWxShareTaskList = {
    "daily": ["task_50_1100", "task_51_1100", "task_66_1110", "task_50_1110", "task_51_1110", "task_51_1112", "task_51_1113", ],
    "newbie": ["task_50_1032", "task_51_1032"],
}
let userWxShareCodeArr = {
    "daily": {},
    "newbie": {},
}

//APP任务
let appActidArray = {
    "daily": [1101, 1103, 1104, 1105, 1109, 1111, 1112, 1113],
    "newbie": [1033, ],
}
let appTaskArray = {
    "daily": [],
    "newbie": [],
}

//微信小程序任务
let wxActidArray = {
    "daily": [1100, 1110, ],
    "newbie": [1032, ],
}
let wxTaskArray = {
    "daily": [],
    "newbie": [],
}

//APP长牛任务
let bullTaskArray = { 
    "rock_bullish":{"taskName":"戳牛任务", "action":"rock_bullish", "actid":1105}, 
    "open_box":{"taskName":"开宝箱", "action":"open_box", "actid":1105}, 
    "open_blindbox":{"taskName":"开盲盒", "action":"open_blindbox", "actid":1105}, 
    "query_blindbox":{"taskName":"查询皮肤数量", "action":"query_blindbox", "actid":1105},
    "sell_skin":{"taskName":"卖皮肤", "action":"sell_skin", "actid":1105},
    "feed":{"taskName":"喂长牛", "action":"feed", "actid":1105},
}

var TxStockAppUrl
var TxStockAppHeader
var TxStockWxHeader

///////////////////////////////////////////////////////////////////

!(async () => {

    if(typeof $request !== "undefined")
    {
        await getRewrite()
    }
    else
    {
        //检查环境变量
        if(!(await checkEnv())){
            return
        }
        
        //初始化任务列表
        await initTaskList()
        
        //获取账户信息
        await initAccountInfo()
        
        //新手任务
        await newbieTask()
        
        //获取互助码和相互助力
        await shareTask()
        
        for (numUser = 0; numUser < totalUser; numUser++)
        {
            await getEnvParam(numUser)
            
            $.log(`\n======= 开始腾讯自选股账号 ${numUser+1} =======\n`)
            
            coinInfo = ""
            
            //扫描可查询的任务列表,
            //await scanAppTaskList(1000,1400,"task_daily","routine",0)
            //await scanWxTaskList(1000,1400,"task_daily","routine",0) //每个大概花费86ms
            
            await appGuessStatus(1); //猜涨跌
            await $.wait(1000)
            
            await dailyTask() //日常任务
            await $.wait(1000)
            
            await bullTask() //长牛任务
            await $.wait(1000)
            
            await todayIncome()//收益查询，提现
            await $.wait(1000)
            
            $.log(`\n======= 结束腾讯自选股账号 ${numUser+1} 任务 =======\n`)
        }
        
        await showmsg()
    }
  

})()
.catch((e) => $.logErr(e))
.finally(() => $.done())

//通知
function showmsg() {
    
    notifyBody = jsname + "运行通知\n\n" + notifyStr
    
    if (notifyFlag != 1) {
        console.log(notifyBody);
    }

    if (notifyFlag == 1) {
        $.msg(notifyBody);
    }
}

async function getRewrite()
{
    if($request.url.indexOf("activity_task_daily.fcgi?") > -1 ||
       $request.url.indexOf("activity_task_continue.fcgi?") > -1) {
        if($request.url.indexOf("openid=") > -1)
        {
            //APP包
            $.setdata($request.url,'TxStockAppUrl')
            $.log(`获取TxStockAppUrl成功: ${$request.url}\n`)
            $.msg(`获取TxStockAppUrl成功: ${$request.url}\n`)
            $.setdata(JSON.stringify($request.headers),'TxStockAppHeader')
            $.log(`获取TxStockAppHeader成功: ${JSON.stringify($request.headers)}\n`)
            $.msg(`获取TxStockAppHeader成功: ${JSON.stringify($request.headers)}\n`)
        }
        else
        {
            //微信包
            $.setdata(JSON.stringify($request.headers),'TxStockWxHeader')
            $.log(`获取TxStockWxHeader成功: ${JSON.stringify($request.headers)}\n`)
            $.msg(`获取TxStockAppHeader成功: ${JSON.stringify($request.headers)}\n`)
        }
    }
}

async function checkEnv()
{
    if($.isNode())
    {
        TxStockAppUrl = process.env.TxStockAppUrl
        TxStockAppHeader = process.env.TxStockAppHeader
        TxStockWxHeader = process.env.TxStockWxHeader
    }
    else
    {
        TxStockAppUrl = $.getdata('TxStockAppUrl')
        TxStockAppHeader = $.getdata('TxStockAppHeader')
        TxStockWxHeader = $.getdata('TxStockWxHeader')
    }
    
    if(!TxStockAppUrl || !TxStockAppHeader || !TxStockWxHeader)
    {
        str1 = TxStockAppUrl ? "" : "TxStockAppUrl"
        str2 = TxStockAppHeader ? "" : "TxStockAppHeader"
        str3 = TxStockWxHeader ? "" : "TxStockWxHeader"
        $.log(`未找到环境变量: ${str1} ${str2} ${str3}\n`)
        return false
    }
    
    if (TxStockAppUrl.indexOf('#') > -1) {
        appUrlArrs = TxStockAppUrl.split('#');
        console.log(`您选择的是用"#"隔开TxStockAppUrl\n`)
    } else if (TxStockAppUrl.indexOf('\n') > -1) {
        appUrlArrs = TxStockAppUrl.split('\n');
        console.log(`您选择的是用"\\n"隔开TxStockAppUrl\n`)
    } else {
        appUrlArrs = [TxStockAppUrl]
    };
    Object.keys(appUrlArrs).forEach((item) => {
        if (appUrlArrs[item]) {
            appUrlArr.push(appUrlArrs[item])
        }
    })
    
    if (TxStockAppHeader.indexOf('#') > -1) {
        appHeaderArrs = TxStockAppHeader.split('#');
        console.log(`您选择的是用"#"隔开TxStockAppHeader\n`)
    } else if (TxStockAppHeader.indexOf('\n') > -1) {
        appHeaderArrs = TxStockAppHeader.split('\n');
        console.log(`您选择的是用"\\n"隔开TxStockAppHeader\n`)
    } else {
        appHeaderArrs = [TxStockAppHeader]
    };
    Object.keys(appHeaderArrs).forEach((item) => {
        if (appHeaderArrs[item]) {
            appHeaderArr.push(appHeaderArrs[item])
        }
    })

    if (TxStockWxHeader.indexOf('#') > -1) {
        wxHeaderArrs = TxStockWxHeader.split('#');
        console.log(`您选择的是用"#"隔开TxStockWxHeader\n`)
    } else if (TxStockWxHeader.indexOf('\n') > -1) {
        wxHeaderArrs = TxStockWxHeader.split('\n');
        console.log(`您选择的是用"\\n"隔开TxStockWxHeader\n`)
    } else {
        wxHeaderArrs = [TxStockWxHeader]
    };
    Object.keys(wxHeaderArrs).forEach((item) => {
        if (wxHeaderArrs[item]) {
            wxHeaderArr.push(wxHeaderArrs[item])
        }
    })
    
    totalUser = appUrlArr.length
    shareFlag = (help && totalUser > 1)
    $.log(`共找到${totalUser}个账号\n`)
    
    return true
}

async function getEnvParam(userNum)
{
    appUrlArrVal = appUrlArr[userNum];
    appHeaderArrVal = JSON.parse(appHeaderArr[userNum]);
    wxHeaderArrVal = JSON.parse(wxHeaderArr[userNum]);
    
    app_openid = appUrlArrVal.match(/&openid=([\w-]+)/)[1]
    app_fskey = appUrlArrVal.match(/&fskey=([\w-]+)/)[1]
    app_token = appUrlArrVal.match(/&access_token=([\w-]+)/)[1]
    app_appName = appUrlArrVal.match(/&_appName=([\w\.,-]+)/)[1]
    app_appver = appUrlArrVal.match(/&_appver=([\w\.,-]+)/)[1]
    app_osVer = appUrlArrVal.match(/&_osVer=([\w\.,-]+)/)[1]
    app_devId = appUrlArrVal.match(/&_devId=([\w-]+)/)[1]
    
    app_ck = appHeaderArrVal["Cookie"]
    app_UA = appHeaderArrVal["User-Agent"]
    
    wx_UA = wxHeaderArrVal["User-Agent"]
    
    pgv_info = wxHeaderArrVal["Cookie"].match(/pgv_info=([\w=]+)/)[1]
    pgv_pvid = wxHeaderArrVal["Cookie"].match(/pgv_pvid=([\w]+)/)[1]
    ts_last = wxHeaderArrVal["Cookie"].match(/ts_last=([\w\/]+)/)[1]
    ts_refer = wxHeaderArrVal["Cookie"].match(/ts_refer=([\w\/\.]+)/)[1]
    ts_sid = wxHeaderArrVal["Cookie"].match(/ts_sid=([\w]+)/)[1]
    ts_uid = wxHeaderArrVal["Cookie"].match(/ts_uid=([\w]+)/)[1]
    qlappid = wxHeaderArrVal["Cookie"].match(/qlappid=([\w]+)/)[1]
    qlskey = wxHeaderArrVal["Cookie"].match(/qlskey=([\w]+)/)[1]
    qluin = wxHeaderArrVal["Cookie"].match(/qluin=([\w@\.]+)/)[1]
    qq_logtype = wxHeaderArrVal["Cookie"].match(/qq_logtype=([\w]+)/)[1]
    wzq_qlappid = wxHeaderArrVal["Cookie"].match(/wzq_qlappid=([\w]+)/)[1]
    wzq_qlskey = wxHeaderArrVal["Cookie"].match(/wzq_qlskey=([\w]+)/)[1]
    wzq_qluin = wxHeaderArrVal["Cookie"].match(/wzq_qluin=([\w-]+)/)[1]
    zxg_openid = wxHeaderArrVal["Cookie"].match(/zxg_openid=([\w-]+)/)[1]
    
    //wx_ck = `pgv_info=${pgv_info}; pgv_pvid=${pgv_pvid}; ts_last=${ts_last}; ts_refer=${ts_refer}; ts_sid=${ts_sid}; ts_uid=${ts_uid}; qlappid=${qlappid}; qlskey=${qlskey}; qluin=${qluin}; qq_logtype=${qq_logtype}; wx_session_time=${sessionTime}; wzq_qlappid=${wzq_qlappid}; wzq_qlskey=${wzq_qlskey}; wzq_qluin=${wzq_qluin}; zxg_openid=${zxg_openid}`
    
    wx_ck = `pgv_info=${pgv_info}; pgv_pvid=${pgv_pvid}; ts_last=${ts_last}; ts_refer=${ts_refer}; ts_sid=${ts_sid}; ts_uid=${ts_uid}; qlappid=${qlappid}; qlskey=${qlskey}; qluin=${qluin}; qq_logtype=${qq_logtype}; wzq_qlappid=${wzq_qlappid}; wzq_qlskey=${wzq_qlskey}; wzq_qluin=${wzq_qluin}; zxg_openid=${zxg_openid}`
}

async function initAccountInfo()
{
    for (numUser = 0; numUser < totalUser; numUser++)
    {
        await getEnvParam(numUser)
        
        await orderQuery(1,1,0,0); //获取用户名
        coinStart.push(coinInfo)
        await $.wait(500)
        
        await signStatus(2002,0); //签到
        await $.wait(1000)
        
        //获取长牛互助码，同时检查长牛是否黑号
        await bullStatus(1)
        await $.wait(500)
    }
}

async function initTaskList() 
{
    $.log(`开始初始化任务列表\n`)
    let taskItem = {}
    
    for(let i=0; i<appActidArray["newbie"].length; i++){
        taskItem = {"taskName":"APP新手任务","activity":"task_continue","type":"app_new_user","actid":appActidArray["newbie"][i]}
        appTaskArray["newbie"].push(taskItem)
    }
    
    for(let i=0; i<appActidArray["daily"].length; i++){
        taskItem = {"taskName":"APP日常任务","activity":"task_daily","type":"routine","actid":appActidArray["daily"][i]}
        appTaskArray["daily"].push(taskItem)
    }
    
    for(let i=0; i<wxActidArray["newbie"].length; i++){
        taskItem = {"taskName":"微信新手任务","activity":"task_continue","type":"wzq_welfare_growth","actid":wxActidArray["newbie"][i]}
        wxTaskArray["newbie"].push(taskItem)
    }
    
    for(let i=0; i<wxActidArray["daily"].length; i++){
        taskItem = {"taskName":"微信日常任务","activity":"task_daily","type":"routine","actid":wxActidArray["daily"][i]}
        wxTaskArray["daily"].push(taskItem)
    }
}

async function bullTask() 
{
    if(bullishFlag == 1 && bullStatusFlag[numUser] == 1) {
        await bullTaskDone(bullTaskArray["rock_bullish"])
        for(let i=0; i<10; i++){
            await bullTaskDone(bullTaskArray["open_box"])
            await $.wait(5000)
        }
        await bullTaskDone(bullTaskArray["open_blindbox"])
        await bullTaskDone(bullTaskArray["query_blindbox"])
        
        await bullStatus(0)
    }
}

async function dailyTask() 
{
    //APP端任务
    if(appTaskFlag == 1) {
        for(let i=0; i<appTaskArray["daily"].length; i++)
        {
            await appTaskList(appTaskArray["daily"][i]);
        }
    }
    
    //微信端任务
    if(wxTaskFlag == 1) {
        for(let i=0; i<wxTaskArray["daily"].length; i++)
        {
            await wxTaskList(wxTaskArray["daily"][i]);
        }
    }
}

async function newbieTask() 
{
    if(newbie == 1) {
        $.log(`\开始做新手任务：\n`)
        for (numUser = 0; numUser < totalUser; numUser++)
        {
            await getEnvParam(numUser)
            
            for(let j=0; j<userAppShareTaskList["newbie"].length; j++)
            {
                await appShareTaskReq(userAppShareTaskList["newbie"][j],"newbie")
            }
            
            for(let j=0; j<userWxShareTaskList["newbie"].length; j++)
            {
                await wxShareTaskReq(userWxShareTaskList["newbie"][j],"newbie")
            }
        }
        
        for (numUser = 0; numUser < totalUser; numUser++)
        {
            await getEnvParam(numUser)
            
            for(let j=0; j<userAppShareTaskList["newbie"].length; j++)
            {
                shareTaskName = userAppShareTaskList["newbie"][j]
                if(userAppShareCodeArr["newbie"][shareTaskName]) {
                    await wxShareTaskDone(shareTaskName,userAppShareCodeArr["newbie"][shareTaskName][helpUser])
                }
            }
            
            for(let j=0; j<userWxShareTaskList["newbie"].length; j++)
            {
                shareTaskName = userWxShareTaskList["newbie"][j]
                if(userWxShareCodeArr["newbie"][shareTaskName]) {
                    await wxShareTaskDone(shareTaskName,userWxShareCodeArr["newbie"][shareTaskName][helpUser])
                }
            }
        }
        
        for (numUser = 0; numUser < totalUser; numUser++)
        {
            await getEnvParam(numUser)
            
            for(let i=0; i<appTaskArray["newbie"].length; i++)
            {
                await appTaskList(appTaskArray["newbie"][i]);
            }
        }
    }
}

async function shareTask() 
{
    if(shareFlag == 1) {
        $.log(`\n开始获取互助码：\n`)
        for (numUser = 0; numUser < totalUser; numUser++)
        {
            await getEnvParam(numUser)
            
            await appGuessStatus(0);
            
            if(appShareFlag == 1) {
                for(let j=0; j<userAppShareTaskList["daily"].length; j++)
                {
                    await appShareTaskReq(userAppShareTaskList["daily"][j],"daily")
                }
            }
            
            if(wxShareFlag == 1) {
                for(let j=0; j<userWxShareTaskList["daily"].length; j++)
                {
                    await wxShareTaskReq(userWxShareTaskList["daily"][j],"daily")
                }
            }
        }
        
        for (numUser = 0; numUser < totalUser; numUser++)
        {
            await getEnvParam(numUser)
            
            //循环帮助
            //helpUser = ((numUser+1) == totalUser) ?  0 : (numUser+1)
            helpUser = ((numUser-1) <0) ?  (totalUser-1) : (numUser-1)
            $.log(`\n======= 账户${nickname[numUser]} 开始帮助 账户${nickname[helpUser]} =======\n`)
                    
            //长牛互助，同一账户只能相互助力3次，默认不跑
            if(bullHelpFlag == 1) {
                if(userAppShareCodeArr["bull_invite"][helpUser]&& userAppShareCodeArr["bull_help"][helpUser])
                {
                    await bullInvite(userAppShareCodeArr["bull_invite"][helpUser],userAppShareCodeArr["bull_help"][helpUser])
                }
            }
            
            if(userAppShareCodeArr["guess_invite"][helpUser] && userAppShareCodeArr["guess_ticket"][helpUser] && userAppShareCodeArr["guess_time"][helpUser])
            {
                await wxGuessHelp(userAppShareCodeArr["guess_invite"][helpUser],userAppShareCodeArr["guess_ticket"][helpUser],userAppShareCodeArr["guess_time"][helpUser]);
            }
            
            //APP助力任务
            if(appShareFlag == 1) {
                for(let j=0; j<userAppShareTaskList["daily"].length; j++)
                {
                    shareTaskName = userAppShareTaskList["daily"][j]
                    if(userAppShareCodeArr["daily"][shareTaskName] && userAppShareCodeArr["daily"][shareTaskName][helpUser]) {
                        await wxShareTaskDone(shareTaskName,userAppShareCodeArr["daily"][shareTaskName][helpUser])
                    }
                }
            }
            
            //微信助力任务
            if(wxShareFlag == 1) {
                for(let j=0; j<userWxShareTaskList["daily"].length; j++)
                {
                    shareTaskName = userWxShareTaskList["daily"][j]
                    if(userWxShareCodeArr["daily"][shareTaskName] && userWxShareCodeArr["daily"][shareTaskName][helpUser]) {
                        await wxShareTaskDone(shareTaskName,userWxShareCodeArr["daily"][shareTaskName][helpUser])
                    }
                }
            }
            
            $.log(`\n======= 账户${nickname[numUser]} 结束助力 =======\n`)
        }
        
        $.log(`\n结束互助任务\n`)
    }
}

async function todayIncome()
{
    await orderQuery(0,1,1,1)
    coinEnd.push(coinInfo)
    
    if(coinEnd[numUser] && coinStart[numUser])
    {
        rewardCoin = coinEnd[numUser] - coinStart[numUser];
        $.log(`账号：${nickname[numUser]}，本次运行获得${rewardCoin}金币\n\n`)
        notifyStr += `账号：${nickname[numUser]}，本次运行获得${rewardCoin}金币\n\n`
    }
}

//扫描可查询的APP任务列表
async function scanAppTaskList(actidStart,actidEnd,activity,type,debugPrint) {
    console.log(`开始查询APP任务列表, activity=${activity}, type=${type}, from ${actidStart} to ${actidEnd}`)
    for(let i=actidStart; i<actidEnd; i++){
        titem = {"taskName":`扫描任务${i}`,"activity":activity,"type":type,"actid":i}
        await appTaskListQuery(titem,debugPrint);
        await $.wait(100)
    }
    console.log(`查询结束，得到列表：`)
    console.log(scanList)
}

//扫描可查询的微信任务列表
async function scanWxTaskList(actidStart,actidEnd,activity,type,debugPrint) {
    console.log(`开始查询微信任务列表, activity=${activity}, type=${type}, from ${actidStart} to ${actidEnd}`)
    for(let i=actidStart; i<actidEnd; i++){
        titem = {"taskName":`扫描任务${i}`,"activity":activity,"type":type,"actid":i}
        await wxTaskListQuery(titem,debugPrint);
        await $.wait(20)
    }
    console.log(`查询结束，得到列表：`)
    console.log(scanList)
}

///////////////////////////////////////////////////////////////////
//签到信息查询
//signType -- 0: 签到, 1: 连续签到奖励
async function signStatus(actid,signType) {
    rndtime = Math.round(new Date().getTime())
    return new Promise((resolve) => {
        let signurl = {
            url: `https://wzq.tenpay.com/cgi-bin/activity_sign_task.fcgi?actid=${actid}&channel=1&type=welfare_sign&action=home&_=${rndtime}&openid=${app_openid}&fskey=${app_fskey}&access_token=${app_token}&_appName=${app_appName}&_appver=${app_appver}&_osVer=${app_osVer}&_devId=${app_devId}`,
            headers: {
                'Cookie': app_ck,
                'Accept': `application/json, text/plain, */*`,
                'Connection': `keep-alive`,
                'Referer': `https://wzq.tenpay.com/activity/page/welwareCenter/`,
                'Accept-Encoding': `gzip, deflate, br`,
                'Host': `wzq.tenpay.com`,
                'User-Agent': app_UA,
                'Accept-Language': `zh-cn`
            },
        };
        $.get(signurl, async (err, resp, data) => {
            try {
                if (err) {
                    console.log("腾讯自选股: API查询请求失败 ‼️‼️");
                    console.log(JSON.stringify(err));
                    $.logErr(err);
                } else {
                    if (safeGet(data)) {
                        let result = JSON.parse(data);
                        if(logDebug) console.log(result);
                        if (result.retcode == 0) {
                            if(!result.forbidden_code) {
                                if(signType == 0){
                                    for(let i=0; i<result.task_pkg.tasks.length; i++){
                                        resultItem = result.task_pkg.tasks[i]
                                        if(resultItem.date == todayDate){
                                            if(resultItem.status == 0){
                                                //今天未签到，去签到
                                                await $.wait(200);
                                                await signtask(actid);
                                            } else {
                                                //今天已签到
                                                $.log(`用户${nickname[numUser]}今天已签到\n`);
                                            }
                                        }
                                    }
                                } else if(signType == 1) {
                                    $.log(`用户${nickname[numUser]}已连续签到${result.task_pkg.continue_sign_days}天，总签到天数${result.task_pkg.total_sign_days}天\n`);
                                    if(result.lotto_chance == 1 && result.lotto_ticket) {
                                        await $.wait(200);
                                        await sign7daysAward(actid,result.lotto_ticket);
                                    }
                                }
                            } else {
                                console.log(`用户${nickname[numUser]}查询签到信息失败，可能已黑号：${result.forbidden_reason}\n`)
                            }
                        } else {
                            console.log(`用户${nickname[numUser]}查询签到信息失败：${result.retmsg}`)
                        }
                    }
                }
            } catch (e) {
                $.logErr(e, resp);
            } finally {
                resolve();
            }
        });
    });
}

//签到
async function signtask(actid) {
    rndtime = Math.round(new Date().getTime())
    return new Promise((resolve) => {
        let signurl = {
            url: `https://wzq.tenpay.com/cgi-bin/activity_sign_task.fcgi?actid=${actid}&channel=1&action=signdone&date=${todayDate}&_=${rndtime}&openid=${app_openid}&fskey=${app_fskey}&access_token=${app_token}&_appName=${app_appName}&_appver=${app_appver}&_osVer=${app_osVer}&_devId=${app_devId}`,
            headers: {
                'Cookie': app_ck,
                'Accept': `application/json, text/plain, */*`,
                'Connection': `keep-alive`,
                'Referer': `https://wzq.tenpay.com/activity/page/welwareCenter/`,
                'Accept-Encoding': `gzip, deflate, br`,
                'Host': `wzq.tenpay.com`,
                'User-Agent': app_UA,
                'Accept-Language': `zh-cn`
            },
        };
        $.get(signurl, async (err, resp, data) => {
            try {
                if (err) {
                    console.log("腾讯自选股: API查询请求失败 ‼️‼️");
                    console.log(JSON.stringify(err));
                    $.logErr(err);
                } else {
                    if (safeGet(data)) {
                        let result = JSON.parse(data);
                        if (result.retcode == 0) {
                            $.log(`签到获得 ${result.reward_desc}\n`);
                            $.log(`签到时间:${time(rndtime)}\n`);
                            await $.wait(5000); //等待5秒
                        } else {
                            $.log(`签到失败：${result.retmsg}`)
                        }
                        await signStatus(actid,1)
                    }
                }
            } catch (e) {
                $.logErr(e, resp);
            } finally {
                resolve();
            }
        });
    });
}

//连续签到奖励
async function sign7daysAward(actid,lotto_ticket) {
    rndtime = Math.round(new Date().getTime())
    return new Promise((resolve) => {
        let signurl = {
            url:  `https://wzq.tenpay.com/cgi-bin/activity_sign_task.fcgi?actid=${actid}&action=award&reward_ticket=${lotto_ticket}&_=${rndtime}&openid=${app_openid}&fskey=${app_fskey}&channel=1&access_token=${app_token}&_appName=${app_appName}&_appver=${app_appver}&_osVer=${app_osVer}&_devId=${app_devId}`,
            headers: {
                'Cookie': app_ck,
                'Accept': `application/json, text/plain, */*`,
                'Connection': `keep-alive`,
                'Referer': `https://wzq.tenpay.com/activity/page/welwareCenter/`,
                'Accept-Encoding': `gzip, deflate, br`,
                'Host': `wzq.tenpay.com`,
                'User-Agent': app_UA,
                'Accept-Language': `zh-cn`
            },
        };
        $.get(signurl, async (err, resp, data) => {
            try {
                if (err) {
                    console.log("腾讯自选股: API查询请求失败 ‼️‼️");
                    console.log(JSON.stringify(err));
                    $.logErr(err);
                } else {
                    if (safeGet(data)) {
                        let result = JSON.parse(data);
                        if (result.retcode == 0) {
                            $.log(`获得连续签到奖励： ${result.reward_desc}\n`);
                        } else {
                            $.log(`领取连续签到奖励失败：${result.retmsg}`)
                        }
                        await $.wait(1000);
                    }
                }
            } catch (e) {
                $.logErr(e, resp);
            } finally {
                resolve();
            }
        });
    });
}

//新手任务奖励
async function appNewbieAward(actid,ticket) {
    return new Promise((resolve, reject) => {
        let testurl = {
            url: `https://wzq.tenpay.com/cgi-bin/activity_task.fcgi?action=award&channel=1&actid=${actid}&reward_ticket=${ticket}&openid=${app_openid}&fskey=${app_fskey}&channel=1&access_token=${app_token}&_appName=${app_appName}&_appver=${app_appver}&_osVer=${app_osVer}&_devId=${app_devId}`,
            headers: {
                'Cookie': app_ck,
                'Accept': `*/*`,
                'Connection': `keep-alive`,
                'Referer': `http://zixuanguapp.finance.qq.com`,
                'Accept-Encoding': `gzip,deflate`,
                'Host': `wzq.tenpay.com`,
                'User-Agent': app_UA,
                'Accept-Language': `zh-Hans-CN;q=1, en-CN;q=0.9`
            },
        }
        $.get(testurl, async (err, resp, data) => {
            try {
                if (err) {
                    console.log("腾讯自选股: API查询请求失败 ‼️‼️");
                    console.log(JSON.stringify(err));
                    $.logErr(err);
                } else {
                    if (safeGet(data)) {
                        let result = JSON.parse(data)
                        if(logDebug) console.log(result)
                        if(result.retcode == 0){
                            $.log(`获得新手任务[actid:${actid}]阶段奖励: ${result.reward_desc}\n`);
                            await $.wait(1000); //等待10秒
                        } else {
                            $.log(`新手任务[actid:${actid}]阶段未完成：${result.retmsg}\n`);
                            await $.wait(100);
                        }
                    }
                }
            } catch (e) {
                $.logErr(e, resp);
            } finally {
                resolve();
            }
        })
    })
}

//APP任务列表查询
async function appTaskListQuery(taskItem,printDebug=0) {
    rndtime = Math.round(new Date().getTime())
    return new Promise((resolve) => {
        let url = {
            url: `https://wzq.tenpay.com/cgi-bin/activity_${taskItem.activity}.fcgi?action=home&type=${taskItem.type}&actid=${taskItem.actid}&channel=1&invite_code=&_=${rndtime}&openid=${app_openid}&fskey=${app_fskey}&channel=1&access_token=${app_token}&_appName=${app_appName}&_appver=${app_appver}&_osVer=${app_osVer}&_devId=${app_devId}`,
            headers: {
                'Cookie': app_ck,
                'Accept': `application/json, text/plain, */*`,
                'Connection': `keep-alive`,
                'Referer': `https://wzq.tenpay.com/activity/page/welwareCenter/`,
                'Accept-Encoding': `gzip, deflate, br`,
                'Host': `wzq.tenpay.com`,
                'User-Agent': app_UA,
                'Accept-Language': `zh-cn`
            },
        };
        $.get(url, async (err, resp, data) => {
            try {
                if (err) {
                    console.log("腾讯自选股: API查询请求失败 ‼️‼️");
                    console.log(JSON.stringify(err));
                    $.logErr(err);
                } else {
                    if (safeGet(data)) {
                        let result = JSON.parse(data);
                        if (result.retcode == 0) {
                            if(result.task_pkg != null && result.task_pkg.length > 0){
                                scanList.push(taskItem.actid)
                                if(printDebug == 1) {
                                    if(logDebug) console.log(result)
                                    console.log(`===================== actid=${taskItem.actid} start ======================`)
                                    for(let i=0; i<result.task_pkg[0].tasks.length; i++){
                                        resultItem = result.task_pkg[0].tasks[i]
                                        console.log(resultItem)
                                    }
                                    console.log(`===================== actid=${taskItem.actid} end ======================`)
                                }
                            }
                        } else {
                            //console.log(`${taskItem.taskName}查询失败：${result.retmsg}`)
                        }
                    }
                }
            } catch (e) {
                $.logErr(e, resp);
            } finally {
                resolve();
            }
        });
    });
}

//APP任务列表
async function appTaskList(taskItem) {
    rndtime = Math.round(new Date().getTime())
    return new Promise((resolve) => {
        let url = {
            url: `https://wzq.tenpay.com/cgi-bin/activity_${taskItem.activity}.fcgi?action=home&type=${taskItem.type}&actid=${taskItem.actid}&invite_code=&_=${rndtime}&openid=${app_openid}&fskey=${app_fskey}&channel=1&access_token=${app_token}&_appName=${app_appName}&_appver=${app_appver}&_osVer=${app_osVer}&_devId=${app_devId}`,
            headers: {
                'Cookie': app_ck,
                'Accept': `application/json, text/plain, */*`,
                'Connection': `keep-alive`,
                'Referer': `https://wzq.tenpay.com/activity/page/welwareCenter/`,
                'Accept-Encoding': `gzip, deflate, br`,
                'Host': `wzq.tenpay.com`,
                'User-Agent': app_UA,
                'Accept-Language': `zh-cn`
            },
        };
        $.get(url, async (err, resp, data) => {
            try {
                if (err) {
                    console.log("腾讯自选股: API查询请求失败 ‼️‼️");
                    console.log(JSON.stringify(err));
                    $.logErr(err);
                } else {
                    if (safeGet(data)) {
                        let result = JSON.parse(data);
                        if(logDebug) console.log(result)
                        if (result.retcode == 0) {
                            if(result.task_pkg != null){
                                let numPkg = result.task_pkg.length
                                for(let i=0; i<numPkg; i++){
                                    //console.log(result.task_pkg[i])
                                    if(result.task_pkg[i].lotto_ticket) {
                                        //可领取新手奖励
                                        await appNewbieAward(taskItem.actid,result.task_pkg[i].lotto_ticket)
                                        continue
                                    }
                                    if(result.task_pkg[i].reward_type > 0) {
                                        //已领取过新手奖励
                                        continue
                                    }
                                    if(result.task_pkg[i].tasks && result.task_pkg[i].tasks[0]) {
                                        let numTask = result.task_pkg[i].tasks.length
                                        for(let j=0; j<numTask; j++){
                                            resultItem = result.task_pkg[i].tasks[j]
                                            //console.log(resultItem)
                                            task_id = resultItem.id
                                            task_tid = resultItem.tid
                                            await appTaskStatus(taskItem,task_id,task_tid);
                                        }
                                    }
                                }
                            }
                        } else {
                            console.log(`${taskItem.taskName}[actid=${taskItem.actid}]查询失败：${result.retmsg}`)
                        }
                    }
                }
            } catch (e) {
                $.logErr(e, resp);
            } finally {
                resolve();
            }
        });
    });
}

//APP任务状态
async function appTaskStatus(taskItem,task_id,task_tid) {
    rndtime = Math.round(new Date().getTime())
    return new Promise((resolve, reject) => {
        let testurl = {
            url: `https://wzq.tenpay.com/cgi-bin/activity_task.fcgi?id=${task_id}&tid=${task_tid}&actid=${taskItem.actid}&channel=1&action=taskstatus&_rndtime=${rndtime}&openid=${app_openid}&fskey=${app_fskey}&channel=1&access_token=${app_token}&_appName=${app_appName}&_appver=${app_appver}&_osVer=${app_osVer}&_devId=${app_devId}`,
            headers: {
                'Cookie': app_ck,
                'Accept': `*/*`,
                'Connection': `keep-alive`,
                'Referer': `http://zixuanguapp.finance.qq.com`,
                'Accept-Encoding': `gzip,deflate`,
                'Host': `wzq.tenpay.com`,
                'User-Agent': app_UA,
                'Accept-Language': `zh-Hans-CN;q=1, en-CN;q=0.9`
            },
        }
        $.get(testurl, async (err, resp, data) => {
            try {
                if (err) {
                    console.log("腾讯自选股: API查询请求失败 ‼️‼️");
                    console.log(JSON.stringify(err));
                    $.logErr(err);
                } else {
                    if (safeGet(data)) {
                        let result = JSON.parse(data)
                        if(logDebug) console.log(result)
                        await $.wait(100);
                        if(result.retcode == 0){
                            if(result.done == 0) {
                                await appTaskticket(taskItem,task_id,task_tid);
                            } else {
                                $.log(`${taskItem.taskName}[actid:${taskItem.actid},id:${task_id},tid:${task_tid}]已完成\n`);
                            }
                        } else {
                            $.log(`${taskItem.taskName}状态查询失败：${result.retmsg}\n`);
                        } 
                    }
                }
            } catch (e) {
                $.logErr(e, resp);
            } finally {
                resolve();
            }
        })
    })
}

//APP票据申请
async function appTaskticket(taskItem,task_id,task_tid) {
    rndtime = Math.round(new Date().getTime())
    return new Promise((resolve, reject) => {
        let testurl = {
            url: `https://wzq.tenpay.com/cgi-bin/activity_task.fcgi?action=taskticket&channel=1&actid=${taskItem.actid}&_rndtime=${rndtime}&openid=${app_openid}&fskey=${app_fskey}&channel=1&access_token=${app_token}&_appName=${app_appName}&_appver=${app_appver}&_osVer=${app_osVer}&_devId=${app_devId}`,
            headers: {
                'Cookie': app_ck,
                'Accept': `*/*`,
                'Connection': `keep-alive`,
                'Referer': `http://zixuanguapp.finance.qq.com`,
                'Accept-Encoding': `gzip,deflate`,
                'Host': `wzq.tenpay.com`,
                'User-Agent': app_UA,
                'Accept-Language': `zh-Hans-CN;q=1, en-CN;q=0.9`
            },
        }
        $.get(testurl, async (err, resp, data) => {
            try {
                if (err) {
                    console.log("腾讯自选股: API查询请求失败 ‼️‼️");
                    console.log(JSON.stringify(err));
                    $.logErr(err);
                } else {
                    if (safeGet(data)) {
                        let result = JSON.parse(data)
                        if(logDebug) console.log(result)
                        await $.wait(100);
                        if(result.retcode == 0 && result.task_ticket){
                            await appTaskDone(taskItem,result.task_ticket,task_id,task_tid);
                        } else {
                            $.log(`${taskItem.taskName}申请票据失败：${result.retmsg}\n`);
                        } 
                    }
                }
            } catch (e) {
                $.logErr(e, resp);
            } finally {
                resolve();
            }
        })
    })
}

//做APP任务
async function appTaskDone(taskItem,ticket,task_id,task_tid) {
    return new Promise((resolve, reject) => {
        let testurl = {
            url: `https://wzq.tenpay.com/cgi-bin/activity_task.fcgi?action=taskdone&channel=1&actid=${taskItem.actid}&id=${task_id}&tid=${task_tid}&task_ticket=${ticket}&openid=${app_openid}&fskey=${app_fskey}&channel=1&access_token=${app_token}&_appName=${app_appName}&_appver=${app_appver}&_osVer=${app_osVer}&_devId=${app_devId}`,
            headers: {
                'Cookie': app_ck,
                'Accept': `*/*`,
                'Connection': `keep-alive`,
                'Referer': `http://zixuanguapp.finance.qq.com`,
                'Accept-Encoding': `gzip,deflate`,
                'Host': `wzq.tenpay.com`,
                'User-Agent': app_UA,
                'Accept-Language': `zh-Hans-CN;q=1, en-CN;q=0.9`
            },
        }
        $.get(testurl, async (err, resp, data) => {
            try {
                if (err) {
                    console.log("腾讯自选股: API查询请求失败 ‼️‼️");
                    console.log(JSON.stringify(err));
                    $.logErr(err);
                } else {
                    if (safeGet(data)) {
                        let result = JSON.parse(data)
                        if(logDebug) console.log(result)
                        await $.wait(100);
                        if(result.retcode == 0){
                            $.log(`完成${taskItem.taskName}[actid:${taskItem.actid},id:${task_id},tid:${task_tid}]:获得 ${result.reward_desc}\n`);
                            await $.wait(10000); //等待10秒
                        } else {
                            $.log(`${taskItem.taskName}[actid:${taskItem.actid},id:${task_id},tid:${task_tid}]未完成：${result.retmsg}\n`);
                        }
                    }
                }
            } catch (e) {
                $.logErr(e, resp);
            } finally {
                resolve();
            }
        })
    })
}

//微信任务列表查询
async function wxTaskListQuery(taskItem,printDebug=0) {
    rndtime = Math.round(new Date().getTime())
    return new Promise((resolve) => {
        let url = {
            url: `https://wzq.tenpay.com/cgi-bin/activity_${taskItem.activity}.fcgi?action=home&type=${taskItem.type}&actid=${taskItem.actid}&invite_code=&_=${rndtime}`,
            headers: {
                'Cookie': wx_ck,
                'Accept': `application/json, text/plain, */*`,
                'Connection': `keep-alive`,
                'Referer': `https://wzq.tenpay.com/activity/page/welwareCenter/`,
                'Accept-Encoding': `gzip, deflate, br`,
                'Host': `wzq.tenpay.com`,
                'User-Agent': wx_UA,
                'Accept-Language': `zh-cn`
            },
        };
        $.get(url, async (err, resp, data) => {
            try {
                if (err) {
                    console.log("腾讯自选股: API查询请求失败 ‼️‼️");
                    console.log(JSON.stringify(err));
                    $.logErr(err);
                } else {
                    if (safeGet(data)) {
                        let result = JSON.parse(data);
                        if (result.retcode == 0) {
                            if(result.task_pkg != null && result.task_pkg.length > 0){
                                scanList.push(taskItem.actid)
                                if(printDebug == 1) {
                                    if(logDebug) console.log(result)
                                    console.log(`===================== actid=${taskItem.actid} start ======================`)
                                    for(let i=0; i<result.task_pkg[0].tasks.length; i++){
                                        resultItem = result.task_pkg[0].tasks[i]
                                        console.log(resultItem)
                                    }
                                    console.log(`===================== actid=${taskItem.actid} end ======================`)
                                }
                            }
                        } else {
                            console.log(`${taskItem.taskName}查询失败：${result.retmsg}`)
                        }
                    }
                }
            } catch (e) {
                $.logErr(e, resp);
            } finally {
                resolve();
            }
        });
    });
}

//WX任务列表
async function wxTaskList(taskItem) {
    rndtime = Math.round(new Date().getTime())
    return new Promise((resolve) => {
        let url = {
            url: `https://wzq.tenpay.com/cgi-bin/activity_${taskItem.activity}.fcgi?action=home&type=${taskItem.type}&actid=${taskItem.actid}&invite_code=&_=${rndtime}`,
            headers: {
                'Cookie': wx_ck,
                'Accept': `application/json, text/plain, */*`,
                'Connection': `keep-alive`,
                'Referer': `https://wzq.tenpay.com/activity/page/welwareCenter/`,
                'Accept-Encoding': `gzip, deflate, br`,
                'Host': `wzq.tenpay.com`,
                'User-Agent': wx_UA,
                'Accept-Language': `zh-cn`
            },
        };
        $.get(url, async (err, resp, data) => {
            try {
                if (err) {
                    console.log("腾讯自选股: API查询请求失败 ‼️‼️");
                    console.log(JSON.stringify(err));
                    $.logErr(err);
                } else {
                    if (safeGet(data)) {
                        let result = JSON.parse(data);
                        if(logDebug) console.log(result)
                        if (result.retcode == 0) {
                            if(result.task_pkg && result.task_pkg[0]){
                                let numPkg = result.task_pkg.length
                                for(let i=0; i<numPkg; i++){
                                    let numTask = result.task_pkg[i].tasks.length
                                    for(let j=0; j<numTask; j++){
                                        resultItem = result.task_pkg[i].tasks[j]
                                        //console.log(resultItem)
                                        task_id = resultItem.id
                                        task_tid = resultItem.tid
                                        await $.wait(100);
                                        await wxTaskStatus(taskItem,task_id,task_tid);
                                    }
                                }
                            }
                        } else {
                            console.log(`${taskItem.taskName}查询失败：${result.retmsg}`)
                        }
                    }
                }
            } catch (e) {
                $.logErr(e, resp);
            } finally {
                resolve();
            }
        });
    });
}

//WX任务状态查询
async function wxTaskStatus(taskItem,task_id,task_tid) {
    rndtime = Math.round(new Date().getTime())
    return new Promise((resolve, reject) => {
        let url = {
            url: `https://wzq.tenpay.com/cgi-bin/activity_task.fcgi?t=${rndtime}`,
            body: `_h5ver=2.0.1&actid=${taskItem.actid}&id=${task_id}&tid=${task_tid}&action=taskstatus`,
            headers: {
                'Accept': `application/json, text/plain, */*`,
                'Origin': `https://wzq.tenpay.com`,
                'Accept-Encoding': `gzip, deflate, br`,
                'Cookie': wx_ck,
                'Content-Type': `application/x-www-form-urlencoded`,
                'Host': `wzq.tenpay.com`,
                'Connection': `keep-alive`,
                'User-Agent': wx_UA,
                'Referer': `https://wzq.tenpay.com/mp/v2/index.html`,
                'Accept-Language': `zh-cn`
            },
        };
        $.post(url, async (err, resp, data) => {
            try {
                if (err) {
                    console.log("腾讯自选股: API查询请求失败 ‼️‼️");
                    console.log(JSON.stringify(err));
                    $.logErr(err);
                } else {
                    if (safeGet(data)) {
                        let result = JSON.parse(data)
                        if(logDebug) console.log(result)
                        await $.wait(100);
                        if(result.retcode == 0){
                            if(result.done == 0) {
                                await wxTaskticket(taskItem,task_id,task_tid);
                            } else {
                                $.log(`${taskItem.taskName}[actid:${taskItem.actid},id:${task_id},tid:${task_tid}]已完成\n`);
                            }
                        } else {
                            $.log(`${taskItem.taskName}状态查询失败：${result.retmsg}\n`);
                        }
                    }
                }
            } catch (e) {
                $.logErr(e, resp);
            } finally {
                resolve();
            }
        })
    })
}

//WX票据申请
async function wxTaskticket(taskItem,task_id,task_tid) {
    rndtime = Math.round(new Date().getTime())
    return new Promise((resolve) => {
        let url = {
            url: `https://wzq.tenpay.com/cgi-bin/activity_task.fcgi?t=${rndtime}`,
            body: `_h5ver=2.0.1&actid=${taskItem.actid}&action=taskticket`,
            headers: {
                'Accept': `application/json, text/plain, */*`,
                'Origin': `https://wzq.tenpay.com`,
                'Accept-Encoding': `gzip, deflate, br`,
                'Cookie': wx_ck,
                'Content-Type': `application/x-www-form-urlencoded`,
                'Host': `wzq.tenpay.com`,
                'Connection': `keep-alive`,
                'User-Agent': wx_UA,
                'Referer': `https://wzq.tenpay.com/mp/v2/index.html`,
                'Accept-Language': `zh-cn`
            },
        };
        $.post(url, async (err, resp, data) => {
            try {
                if (err) {
                    console.log("腾讯自选股: API查询请求失败 ‼️‼️");
                    console.log(JSON.stringify(err));
                    $.logErr(err);
                } else {
                    if (safeGet(data)) {
                        let result = JSON.parse(data);
                        if(logDebug) console.log(result)
                        await $.wait(100);
                        if(result.retcode == 0 && result.task_ticket){
                            await wxTaskDone(taskItem,result.task_ticket,task_id,task_tid);
                        } else {
                            $.log(`${taskItem.taskName}申请票据失败：${result.retmsg}\n`);
                        } 
                    }
                }
            } catch (e) {
                $.logErr(e, resp);
            } finally {
                resolve();
            }
        });
    });
}

//做WX任务
async function wxTaskDone(taskItem,wxticket,task_id,task_tid) {
    rndtime = Math.round(new Date().getTime())
    return new Promise((resolve, reject) => {
        let url = {
            url: `https://wzq.tenpay.com/cgi-bin/activity_task.fcgi?t=${rndtime}`,
            body: `_h5ver=2.0.1&actid=${taskItem.actid}&tid=${task_tid}&id=${task_id}&task_ticket=${wxticket}&action=taskdone`,
            headers: {
                'Accept': `application/json, text/plain, */*`,
                'Origin': `https://wzq.tenpay.com`,
                'Accept-Encoding': `gzip, deflate, br`,
                'Cookie': wx_ck,
                'Content-Type': `application/x-www-form-urlencoded`,
                'Host': `wzq.tenpay.com`,
                'Connection': `keep-alive`,
                'User-Agent': wx_UA,
                'Referer': `https://wzq.tenpay.com/mp/v2/index.html`,
                'Accept-Language': `zh-cn`
            },
        };
        $.post(url, async (err, resp, data) => {
            try {
                if (err) {
                    console.log("腾讯自选股: API查询请求失败 ‼️‼️");
                    console.log(JSON.stringify(err));
                    $.logErr(err);
                } else {
                    if (safeGet(data)) {
                        let result = JSON.parse(data)
                        if(logDebug) console.log(result)
                        await $.wait(100);
                        if(result.retcode == 0){
                            $.log(`完成${taskItem.taskName}[actid:${taskItem.actid},id:${task_id},tid:${task_tid}]:获得 ${result.reward_desc}\n`);
                            await $.wait(10000); //等待10秒
                        } else {
                            $.log(`${taskItem.taskName}[actid:${taskItem.actid},id:${task_id},tid:${task_tid}]未完成：${result.retmsg}\n`);
                        }
                    }
                }
            } catch (e) {
                $.logErr(e, resp);
            } finally {
                resolve();
            }
        })
    })
}

//提现查询
async function orderQuery(getName,getCoinNum,isWithdraw,logCoin) {
    rndtime = Math.round(new Date().getTime())
    return new Promise((resolve, reject) => {
        let testurl = {
            url: `https://zqact03.tenpay.com/cgi-bin/shop.fcgi?action=home_v2&type=2&_=${rndtime}&openid=${app_openid}&fskey=${app_fskey}&channel=1&access_token=${app_token}&_appName=${app_appName}&_appver=${app_appver}&_osVer=${app_osVer}&_devId=${app_devId}`,
            headers: {
                'Cookie': app_ck,
                'Accept': `*/*`,
                'Connection': `keep-alive`,
                'Referer': `https://zqact03.tenpay.com/activity/page/exchangeRights/`,
                'Accept-Encoding': `gzip, deflate, br`,
                'Host': `zqact03.tenpay.com`,
                'User-Agent': app_UA,
                'Accept-Language': `zh-CN,zh-Hans;q=0.9`
            },
        }
        $.get(testurl, async (err, resp, data) => {
            try {
                if (err) {
                    console.log("腾讯自选股: API查询请求失败 ‼️‼️");
                    console.log(JSON.stringify(err));
                    $.logErr(err);
                } else {
                    if (safeGet(data)) {
                        let result = JSON.parse(data)
                        if(logDebug) console.log(result)
                        if(result.retcode == 0){
                            if(getName == 1) {
                                $.log(`获取账户${numUser+1}昵称成功：${result.shop_asset.nickname}\n`);
                                nickname.push(result.shop_asset.nickname)
                            }
                            if(getCoinNum == 1) {
                                coinInfo = result.shop_asset.amount
                            }
                            $.log(`账户${nickname[numUser]}金币余额: ${result.shop_asset.amount}\n`);
                            if(logCoin) {
                                notifyStr += `账户${nickname[numUser]}金币余额: ${result.shop_asset.amount}\n`
                            }
                            if(cash != 0 && isWithdraw == 1) {
                                if(result.cash != null && result.cash.length > 0){
                                    let cashStr = `${cash}元现金`
                                    for(let k=0; k<result.cash.length; k++){
                                        cashItem = result.cash[k]
                                        //console.log(cashItem)
                                        if(cashItem.item_desc == cashStr){
                                            $.log(`提现${cashItem.item_desc}，需要${cashItem.coins}金币\n`);
                                            if(coinInfo-cashItem.coins >= 0){
                                                $.log(`账户${nickname[numUser]}金币余额多于${cashItem.coins}，开始提现${cashStr}\n`);
                                                notifyStr += `账户${nickname[numUser]}金币余额多于${cashItem.coins}，开始提现${cashStr}\n`
                                                await cashTicket(cashItem.item_id)
                                            } else {
                                                $.log(`账户${nickname[numUser]}金币余额不足，不进行提现\n`);
                                            }
                                        }
                                    }
                                }
                            }
                        } else {
                            $.log(`提现列表获取失败：${task.retmsg}\n`);
                        }
                    }
                }
            } catch (e) {
                $.logErr(e, resp);
            } finally {
                resolve();
            }
        })
    })
}

//提现票据
async function cashTicket(item_id) {
    rndtime = Math.round(new Date().getTime())
    return new Promise((resolve) => {
        let url = {
            url: `https://zqact03.tenpay.com/cgi-bin/shop.fcgi?action=order_ticket&type=2&_=${rndtime}&openid=${app_openid}&fskey=${app_fskey}&channel=1&access_token=${app_token}&_appName=${app_appName}&_appver=${app_appver}&_osVer=${app_osVer}&_devId=${app_devId}`,
            headers: {
                'Cookie': app_ck,
                'Accept': `*/*`,
                'Connection': `keep-alive`,
                'Referer': `https://zqact03.tenpay.com/activity/page/exchangeRights/`,
                'Accept-Encoding': `gzip, deflate, br`,
                'Host': `zqact03.tenpay.com`,
                'User-Agent': app_UA,
                'Accept-Language': `zh-CN,zh-Hans;q=0.9`
            },
        };
        $.get(url, async (err, resp, data) => {
            try {
                if (err) {
                    console.log("腾讯自选股: API查询请求失败 ‼️‼️");
                    console.log(JSON.stringify(err));
                    $.logErr(err);
                } else {
                    if (safeGet(data)) {
                        let result = JSON.parse(data);
                        if(result.retcode == 0){
                            await getcash(result.ticket,item_id)
                        } else {
                            $.log(`提现票据申请失败：${task.retmsg}\n`);
                        }
                    }
                }
            } catch (e) {
                $.logErr(e, resp);
            } finally {
                resolve();
            }
        });
    });
}

//提现请求
async function getcash(cashticketFb,item_id) {
    rndtime = Math.round(new Date().getTime())
    return new Promise((resolve) => {
        let url = {
            url: `https://zqact03.tenpay.com/cgi-bin/shop.fcgi?action=order&type=2&ticket=${cashticketFb}&item_id=${item_id}&_=${rndtime}&openid=${app_openid}&fskey=${app_fskey}&channel=1&access_token=${app_token}&_appName=${app_appName}&_appver=${app_appver}&_osVer=${app_osVer}&_devId=${app_devId}`,
            headers: {
                'Cookie': app_ck,
                'Accept': `*/*`,
                'Connection': `keep-alive`,
                'Referer': `https://zqact03.tenpay.com/activity/page/exchangeRights/`,
                'Accept-Encoding': `gzip, deflate, br`,
                'Host': `zqact03.tenpay.com`,
                'User-Agent': app_UA,
                'Accept-Language': `zh-CN,zh-Hans;q=0.9`
            },
        };
        $.get(url, async (err, resp, data) => {
            try {
                if (err) {
                    console.log("腾讯自选股: API查询请求失败 ‼️‼️");
                    console.log(JSON.stringify(err));
                    $.logErr(err);
                } else {
                    if (safeGet(data)) {
                        let result = JSON.parse(data);
                        if(logDebug) console.log(result)
                        if(result.retcode == 0){
                            $.log(`提现结果:${result.retmsg}`);
                            notifyStr += `提现结果:${result.retmsg}\n`
                            $.log(`查询剩余金额：\n`);
                            await orderQuery(0,0,0,1)
                        } else {
                            $.log(`提现失败：${result.retmsg}\n`)
                            notifyStr += `提现失败：${result.retmsg}\n`
                        }
                    }
                }
            } catch (e) {
                $.logErr(e, resp);
            } finally {
                resolve();
            }
        });
    });
}

//APP长牛任务
async function bullTaskDone(taskItem, extra="") {
    rndtime = Math.round(new Date().getTime())
    return new Promise((resolve) => {
        let signurl = {
            url: `https://zqact03.tenpay.com/cgi-bin/activity_year_party.fcgi?type=bullish&action=${taskItem.action}&actid=${taskItem.actid}${extra}&_=${rndtime}&openid=${app_openid}&fskey=${app_fskey}&channel=1&access_token=${app_token}&_appName=${app_appName}&_appver=${app_appver}&_osVer=${app_osVer}&_devId=${app_devId}`,
            headers: {
                'Cookie': app_ck,
                'Accept': `*/*`,
                'Connection': `keep-alive`,
                'Referer': `https://zqact03.tenpay.com/activity/page/raisebull/`,
                'Host': `zqact03.tenpay.com`,
                'User-Agent': app_UA,
                'Accept-Encoding': `gzip, deflate, br`,
                'Accept-Language': `zh-CN,zh-Hans;q=0.9`
            },
        };
        $.get(signurl, async (err, resp, data) => {
            try {
                if (err) {
                    console.log("腾讯自选股: API查询请求失败 ‼️‼️");
                    console.log(JSON.stringify(err));
                    $.logErr(err);
                } else {
                    if (safeGet(data)) {
                        let result = JSON.parse(data);
                        if(logDebug) console.log(result)
                        if(result.retcode == 0) {
                            if(result.forbidden_code > 0) {
                                $.log(`结束${taskItem.taskName}：${result.forbidden_reason}\n`);
                                if(logDebug) console.log(result)
                            } else if(result.reward_info) {
                                $.log(`${taskItem.taskName}获得: ${result.reward_info[0].reward_desc}\n`);
                                await $.wait(Math.random()*2000+7000)
                                await bullTaskDone(taskItem)
                            } else if(result.award_desc) {
                                $.log(`${taskItem.taskName}获得: ${result.award_desc}\n`);
                                await $.wait(Math.random()*1000+2000)
                                await bullTaskDone(taskItem,extra)
                            } else if(result.skin_info) {
                                $.log(`${taskItem.taskName}获得: ${result.skin_info.skin_desc}\n`);
                                await $.wait(Math.random()*2000+3000)
                                await bullTaskDone(taskItem)
                            } else if(result.skin_list && result.skin_list[0]) {
                                let numItem = result.skin_list.length
                                for(let j=0; j<numItem; j++) {
                                    let skinItem = result.skin_list[j]
                                    if(skinItem.skin_num > 1) {
                                        await bullTaskDone(bullTaskArray["sell_skin"],`&skin_type=${skinItem.skin_type}`)
                                    }
                                }
                            } else if(result.feed_reward_info) {
                                $.log(`${taskItem.taskName}获得: ${result.feed_reward_info.reward_desc}\n`);
                                if(result.level_up_status == 1) {
                                $.log(`长牛升级到等级${result.update_new_level}，获得: ${result.level_reward_info.reward_desc}\n`);
                            }
                                await $.wait(Math.random()*3000+6000)
                                await bullTaskDone(taskItem)
                            } else {
                                console.log(result)
                            } 
                        } else {
                        $.log(`${taskItem.taskName}失败：${result.retmsg}\n`);
                        }
                    }
                }
            } catch (e) {
                $.logErr(e, resp);
            } finally {
                resolve();
            }
        });
    });
}

//APP长牛状态+获取互助码
async function bullStatus(getCode) {
    rndtime = Math.round(new Date().getTime())
    return new Promise((resolve) => {
        let signurl = {
            url: `https://zqact03.tenpay.com/cgi-bin/activity_year_party.fcgi?invite_code=&help_code=&share_date=&type=bullish&action=home&actid=1105&_=${rndtime}&openid=${app_openid}&fskey=${app_fskey}&channel=1&access_token=${app_token}&_appName=${app_appName}&_appver=${app_appver}&_osVer=${app_osVer}&_devId=${app_devId}`,
            headers: {
                'Cookie': app_ck,
                'Accept': `*/*`,
                'Connection': `keep-alive`,
                'Referer': `https://zqact03.tenpay.com/activity/page/raisebull/`,
                'Host': `zqact03.tenpay.com`,
                'User-Agent': app_UA,
                'Accept-Encoding': `gzip, deflate, br`,
                'Accept-Language': `zh-CN,zh-Hans;q=0.9`
            },
        };
        $.get(signurl, async (err, resp, data) => {
            try {
                if (err) {
                    console.log("腾讯自选股: API查询请求失败 ‼️‼️");
                    console.log(JSON.stringify(err));
                    $.logErr(err);
                } else {
                    if (safeGet(data)) {
                        let result = JSON.parse(data);
                        if(logDebug) console.log(result)
                        if(result.retcode == 0) {
                            if(result.forbidden_code) {
                                $.log(`用户${nickname[numUser]}可能已黑号：${result.forbidden_reason}\n`);
                                bullStatusFlag.push(0)
                            } else {
                                bullStatusFlag.push(1)
                                if(getCode == 1) {
                                    if(bullHelpFlag == 1 && shareFlag == 1) {
                                        userAppShareCodeArr["bull_invite"].push(result.invite_code)
                                        userAppShareCodeArr["bull_help"].push(result.help_code)
                                        $.log(`获取用户${nickname[numUser]}的长牛互助码: invite_code=${result.invite_code}, help_code=${result.help_code}\n`);
                                    } else {
                                        userAppShareCodeArr["bull_invite"].push("")
                                        userAppShareCodeArr["bull_help"].push("")
                                    }
                                } else {
                                    $.log(`长牛状态：\n`)
                                    $.log(`等级: ${result.bullish_info.level}\n`)
                                    $.log(`下一级需要经验: ${result.bullish_info.next_level_exp}\n`)
                                    $.log(`现有经验: ${result.bullish_info.exp_value}\n`)
                                    $.log(`现有牛气: ${result.bullish_info.bullish_value}，开始喂食\n`)
                                    if(result.bullish_info.bullish_value >= 500) {
                                        await bullTaskDone(bullTaskArray["feed"])
                                    }
                                }
                            }
                        } else {
                            $.log(`查询长牛状态失败：${result.retmsg}\n`);
                            bullStatusFlag.push(0)
                        }
                    }
                }
            } catch (e) {
                $.logErr(e, resp);
            } finally {
                resolve();
            }
        });
    });
}

//长牛互助邀请
async function bullInvite(inviteCode="",helpCode="") {
    rndtime = Math.round(new Date().getTime())
    return new Promise((resolve, reject) => {
        let url = {
            url: `https://zqact03.tenpay.com/cgi-bin/activity_year_party.fcgi?invite_code=${inviteCode}&help_code=${helpCode}&share_date=${todayDate}&type=bullish&action=home&actid=1105&_=${rndtime}`,
            headers: {
                'Accept': `application/json, text/plain, */*`,
                'Accept-Encoding': `gzip, deflate, br`,
                'Cookie': wx_ck,
                'Content-Type': `application/x-www-form-urlencoded`,
                'Host': `zqact03.tenpay.com`,
                'Connection': `keep-alive`,
                'User-Agent': wx_UA,
                'Referer': `https://zqact03.tenpay.com/activity/page/raisebull/?inviteCode=${inviteCode}&helpCode=${helpCode}&date=${todayDate}`,
                'Accept-Language': `zh-cn`
            },
        };
        $.get(url, async (err, resp, data) => {
            try {
                if (err) {
                    console.log("腾讯自选股: API查询请求失败 ‼️‼️");
                    console.log(JSON.stringify(err));
                    $.logErr(err);
                } else {
                    if (safeGet(data)) {
                        let result = JSON.parse(data)
                        if(logDebug) console.log(result)
                        if(result.retcode == 0){
                            await bullHelpReward(inviteCode,helpCode)
                            await $.wait(1000)
                        } else {
                            $.log(`长牛互助邀请失败：${result.retmsg}\n`);
                        }
                    }
                }
            } catch (e) {
                $.logErr(e, resp);
            } finally {
                resolve();
            }
        })
    })
}

//长牛互助奖励
async function bullHelpReward(inviteCode="",helpCode="") {
    rndtime = Math.round(new Date().getTime())
    return new Promise((resolve, reject) => {
        let url = {
            url: `https://zqact03.tenpay.com/cgi-bin/activity_year_party.fcgi?type=bullish&action=help&actid=1105&help_code=${helpCode}&share_date=${todayDate}&_=${rndtime}`,
            headers: {
                'Accept': `application/json, text/plain, */*`,
                'Accept-Encoding': `gzip, deflate, br`,
                'Cookie': wx_ck,
                'Content-Type': `application/x-www-form-urlencoded`,
                'Host': `zqact03.tenpay.com`,
                'Connection': `keep-alive`,
                'User-Agent': wx_UA,
                'Referer': `https://zqact03.tenpay.com/activity/page/raisebull/?inviteCode=${inviteCode}&helpCode=${helpCode}&date=${todayDate}&_=${rndtime}`,
                'Accept-Language': `zh-cn`
            },
        };
        $.get(url, async (err, resp, data) => {
            try {
                if (err) {
                    console.log("腾讯自选股: API查询请求失败 ‼️‼️");
                    console.log(JSON.stringify(err));
                    $.logErr(err);
                } else {
                    if (safeGet(data)) {
                        let result = JSON.parse(data)
                        if(logDebug) console.log(result)
                        if(result.retcode == 0){
                            if(result.forbidden_code > 0){
                                $.log(`长牛互助获取奖励失败：${result.forbidden_reason}\n`);
                            } else {
                                $.log(`长牛互助获得：${result.reward_info.reward_desc}\n`);
                            }
                        } else {
                            $.log(`长牛互助获取奖励失败：${result.retmsg}\n`);
                        }
                    }
                }
            } catch (e) {
                $.logErr(e, resp);
            } finally {
                resolve();
            }
        })
    })
}

//分享任务-APP端发起
async function appShareTaskReq(share_type,task_type) {
    rndtime = Math.round(new Date().getTime())
    return new Promise((resolve) => {
        let url = {
            url: `https://wzq.tenpay.com/cgi-bin/activity/activity_share.fcgi?channel=1&action=query_share_code&share_type=${share_type}&_rndtime=${rndtime}&_appName=${app_appName}&_dev=iPhone13,2&_devId=${app_devId}&_appver=${app_appver}&_ifChId=&_isChId=1&_osVer=${app_osVer}&openid=${app_openid}&fskey=${app_fskey}&access_token=${app_token}&buildType=store&check=11&_idfa=&lang=zh_CN`,
            headers: {
                'Cookie': app_ck,
                'Accept': `application/json, text/plain, */*`,
                'Connection': `keep-alive`,
                'Referer': `https://wzq.tenpay.com/activity/page/welwareCenter/`,
                'Accept-Encoding': `gzip, deflate, br`,
                'Host': `wzq.tenpay.com`,
                'User-Agent': app_UA,
                'Accept-Language': `zh-cn`
            },
        };
        $.get(url, async (err, resp, data) => {
            try {
                if(!userAppShareCodeArr[task_type][share_type]) {
                    userAppShareCodeArr[task_type][share_type] = []
                }
                if (err) {
                    console.log("腾讯自选股: API查询请求失败 ‼️‼️");
                    console.log(JSON.stringify(err));
                    $.logErr(err);
                } else {
                    if (safeGet(data)) {
                        let result = JSON.parse(data);
                        if(logDebug) console.log(result)
                        if(result.retcode == 0) {
                            userAppShareCodeArr[task_type][share_type].push(result.share_code)
                            $.log(`获取用户${nickname[numUser]}的APP的${share_type}互助码: ${result.share_code}\n`);
                        } else {
                            $.log(`获取用户${nickname[numUser]}的APP的${share_type}互助码失败：${result.retmsg}\n`);
                            userAppShareCodeArr[task_type][share_type].push("")
                        }
                        await $.wait(1000)
                    }
                }
            } catch (e) {
                $.logErr(e, resp);
            } finally {
                resolve();
            }
        });
    });
}

//分享任务-微信端发起
async function wxShareTaskReq(share_type,task_type) {
    rndtime = Math.round(new Date().getTime())
    return new Promise((resolve, reject) => {
        let url = {
            url: `https://wzq.tenpay.com/cgi-bin/activity_share.fcgi?t=${rndtime}`,
            body: `_h5ver=2.0.1&action=query_share_code&share_type=${share_type}`,
            headers: {
                'Accept': `application/json, text/plain, */*`,
                'Origin': `https://wzq.tenpay.com`,
                'Accept-Encoding': `gzip, deflate, br`,
                'Cookie': wx_ck,
                'Content-Type': `application/x-www-form-urlencoded`,
                'Host': `wzq.tenpay.com`,
                'Connection': `keep-alive`,
                'User-Agent': wx_UA,
                'Referer': `https://wzq.tenpay.com/mp/v2/index.html`,
                'Accept-Language': `zh-cn`
            },
        };
        $.post(url, async (err, resp, data) => {
            try {
                if(!userWxShareCodeArr[task_type][share_type]) {
                    userWxShareCodeArr[task_type][share_type] = []
                }
                if (err) {
                    console.log("腾讯自选股: API查询请求失败 ‼️‼️");
                    console.log(JSON.stringify(err));
                    $.logErr(err);
                } else {
                    if (safeGet(data)) {
                        let result = JSON.parse(data);
                        //console.log(data)
                        if(result.retcode == 0) {
                            userWxShareCodeArr[task_type][share_type].push(result.share_code)
                            $.log(`获取用户${nickname[numUser]}的微信的${share_type}互助码: ${result.share_code}\n`);
                        } else {
                            $.log(`获取用户${nickname[numUser]}的微信的${share_type}互助码失败：${result.retmsg}\n`);
                            userWxShareCodeArr[task_type][share_type].push("")
                        }
                    }
                }
            } catch (e) {
                $.logErr(e, resp);
            } finally {
                resolve();
            }
        })
    })
}

//分享任务-微信端完成
async function wxShareTaskDone(share_type,share_code) {
    rndtime = Math.round(new Date().getTime())
    return new Promise((resolve, reject) => {
        let url = {
            url: `https://wzq.tenpay.com/cgi-bin/activity_share.fcgi?t=${rndtime}`,
            body: `_h5ver=2.0.1&action=share_code_info&share_type=${share_type}&share_code=${share_code}`,
            headers: {
                'Accept': `application/json, text/plain, */*`,
                'Origin': `https://wzq.tenpay.com`,
                'Accept-Encoding': `gzip, deflate, br`,
                'Cookie': wx_ck,
                'Content-Type': `application/x-www-form-urlencoded`,
                'Host': `wzq.tenpay.com`,
                'Connection': `keep-alive`,
                'User-Agent': wx_UA,
                'Referer': `https://wzq.tenpay.com/mp/v2/index.html?stat_data=4001000011&remindtype=&__share_flag__=1`,
                'Accept-Language': `zh-cn`
            },
        };
        $.post(url, async (err, resp, data) => {
            try {
                if (err) {
                    console.log("腾讯自选股: API查询请求失败 ‼️‼️");
                    console.log(JSON.stringify(err));
                    $.logErr(err);
                } else {
                    if (safeGet(data)) {
                        let result = JSON.parse(data);
                        //console.log(data)
                        if(result.retcode == 0) {
                            if(result.share_code_info && result.share_code_info.status == 1) {
                                $.log(`${share_type}互助成功：对方昵称 ${result.share_code_info.nickname}\n`);
                            } else if(result.retmsg == "OK") {
                                $.log(`${share_type}已经互助过了\n`);
                            } else {
                                console.log(result)
                            }
                            await $.wait(1000)
                        } else {
                            $.log(`${share_type}互助失败：${result.retmsg}\n`);
                        }
                    }
                }
            } catch (e) {
                $.logErr(e, resp);
            } finally {
                resolve();
            }
        })
    })
}

//猜涨跌互助
async function wxGuessHelp(invite_code="",invite_ticket="",invite_time="") {
    let guessTicket = encodeURI(invite_ticket)
    rndtime = Math.round(new Date().getTime())
    return new Promise((resolve, reject) => {
        let url = {
            url: `https://zqact.tenpay.com/cgi-bin/guess_home.fcgi?channel=0&source=2&new_version=2&invite_code=${invite_code}&invite_time=${invite_time}&invite_ticket=${guessTicket}&_=${rndtime}`,
            headers: {
                'Accept': `*/*`,
                'Accept-Encoding': `gzip, deflate, br`,
                'Cookie': wx_ck,
                'Content-Type': `application/x-www-form-urlencoded`,
                'Host': `zqact.tenpay.com`,
                'Connection': `keep-alive`,
                'User-Agent': wx_UA,
                'Referer': `https://zqact.tenpay.com/activity/page/guessRiseFall/`,
                'Accept-Language': `zh-cn`
            },
        };
        $.get(url, async (err, resp, data) => {
            try {
                if (err) {
                    console.log("腾讯自选股: API查询请求失败 ‼️‼️");
                    console.log(JSON.stringify(err));
                    $.logErr(err);
                } else {
                    if (safeGet(data)) {
                        let result = JSON.parse(data);
                        //console.log(data)
                        if(result.retcode == 0) {
                            $.log(`猜涨跌互助成功\n`);
                        } else {
                            $.log(`猜涨跌互助失败：${result.retmsg}\n`);
                        }
                        await $.wait(1000)
                    }
                }
            } catch (e) {
                $.logErr(e, resp);
            } finally {
                resolve();
            }
        })
    })
}

//猜涨跌状态，获取互助码
async function appGuessStatus(isGuess) {
    curTime = new Date()
    rndtime = Math.round(curTime.getTime())
    currentHour = curTime.getHours()
    let isGuessTime = ((currentHour < 13) && (currentHour > 9)) ? 1 : 0
    return new Promise((resolve) => {
        let url = {
            url: `https://zqact.tenpay.com/cgi-bin/guess_home.fcgi?channel=1&source=2&new_version=2&_=${rndtime}&openid=${app_openid}&fskey=${app_fskey}&access_token=${app_token}&_appName=${app_appName}&_appver=${app_appver}&_osVer=${app_osVer}&_devId=${app_devId}`,
            headers: {
                'Cookie': app_ck,
                'Accept': `application/json, text/plain, */*`,
                'Connection': `keep-alive`,
                'Referer': `https://zqact.tenpay.com/activity/page/guessRiseFall/`,
                'Accept-Encoding': `gzip, deflate, br`,
                'Host': `zqact.tenpay.com`,
                'User-Agent': app_UA,
                'Accept-Language': `zh-cn`
            },
        };
        $.get(url, async (err, resp, data) => {
            try {
                if (err) {
                    console.log("腾讯自选股: API查询请求失败 ‼️‼️");
                    console.log(JSON.stringify(err));
                    $.logErr(err);
                } else {
                    if (safeGet(data)) {
                        let result = JSON.parse(data);
                        if(logDebug) console.log(result)
                        if(result.retcode == 0) {
                            if(isGuess == 1) {
                                await $.wait(1000)
                                if(result.notice_info) {
                                    if(logDebug) console.log(result)
                                    if(result.notice_info.answer_status == 1) {
                                        $.log(`上期猜涨跌回答正确，正在取得奖励\n`);
                                        await appGuessAward(result.notice_info.date)
                                    } else {
                                        $.log(`上期猜涨跌回答错误\n`);
                                    }
                                    await $.wait(1000)
                                }
                                if(isGuessTime && ((result.T_info && result.T_info.user_answer == 0) || (result.T1_info && result.T1_info.user_answer == 0))) {
                                    let guessOption = 1
                                    if(result.stockinfo) {
                                        let guessOption = (result.stockinfo.zdf.substr(0,1) == '-') ? 2 : 1
                                        $.log(`当前上证指数涨幅为${result.stockinfo.zdf}%，为你猜${guessStr}\n`);
                                    } else {
                                        $.log(`未获取到上证指数状态，默认为你猜涨\n`);
                                    }
                                    if(result.date_list) {
                                        for(let i=0; i<result.date_list.length; i++) {
                                            let guessItem = result.date_list[i]
                                            if(guessItem.status == 3 && guessItem.date == todayDate) {
                                                await appGuessRiseFall(guessOption,guessItem.date)
                                            }
                                        }
                                    }
                                } else {
                                    $.log(`脚本只会在10点到13点之间进行竞猜，当前为非竞猜时段\n`);
                                }
                            } else {
                                if(result.invite_info && result.invite_info.invite_code && result.invite_info.invite_ticket && result.invite_info.invite_time) {
                                    userAppShareCodeArr["guess_invite"].push(result.invite_info.invite_code)
                                    userAppShareCodeArr["guess_ticket"].push(result.invite_info.invite_ticket)
                                    userAppShareCodeArr["guess_time"].push(result.invite_info.invite_time)
                                    $.log(`获取用户${nickname[numUser]}的猜涨跌互助码：${result.invite_info.invite_code}\n`);
                                    $.log(`获取用户${nickname[numUser]}的猜涨跌票据：${result.invite_info.invite_ticket}\n`);
                                } else {
                                    $.log(`获取用户${nickname[numUser]}的猜涨跌互助码失败\n`);
                                    userAppShareCodeArr["guess_invite"].push("")
                                    userAppShareCodeArr["guess_ticket"].push("")
                                    userAppShareCodeArr["guess_time"].push("")
                                }
                            }
                        } else {
                            $.log(`获取用户${nickname[numUser]}的猜涨跌状态失败：${result.retmsg}\n`);
                        }
                        await $.wait(1000)
                    }
                }
            } catch (e) {
                $.logErr(e, resp);
            } finally {
                resolve();
            }
        });
    });
}

//猜涨跌奖励
async function appGuessAward(guessDate) {
    rndtime = Math.round(curTime.getTime())
    return new Promise((resolve) => {
        let url = {
            url: `https://zqact.tenpay.com/cgi-bin/activity.fcgi?channel=1&activity=guess_new&guess_act_id=3&guess_date=${guessDate}&guess_reward_type=1&_=${rndtime}&openid=${app_openid}&fskey=${app_fskey}&access_token=${app_token}&_appName=${app_appName}&_appver=${app_appver}&_osVer=${app_osVer}&_devId=${app_devId}`,
            headers: {
                'Cookie': app_ck,
                'Accept': `application/json, text/plain, */*`,
                'Connection': `keep-alive`,
                'Referer': `https://zqact.tenpay.com/activity/page/guessRiseFall/`,
                'Accept-Encoding': `gzip, deflate, br`,
                'Host': `zqact.tenpay.com`,
                'User-Agent': app_UA,
                'Accept-Language': `zh-cn`
            },
        };
        $.get(url, async (err, resp, data) => {
            try {
                if (err) {
                    console.log("腾讯自选股: API查询请求失败 ‼️‼️");
                    console.log(JSON.stringify(err));
                    $.logErr(err);
                } else {
                    if (safeGet(data)) {
                        let result = JSON.parse(data);
                        if(logDebug) console.log(result)
                        if(result.retcode == 0) {
                            $.log(`获得${reward_memo}：${reward_value}金币\n`);
                        } else {
                            $.log(`获得猜涨跌奖励失败：${result.retmsg}\n`);
                        }
                    }
                }
            } catch (e) {
                $.logErr(e, resp);
            } finally {
                resolve();
            }
        });
    });
}

//猜涨跌
async function appGuessRiseFall(answer,guessDate) {
    rndtime = Math.round(new Date().getTime())
    return new Promise((resolve) => {
        let url = {
            url: `https://zqact.tenpay.com/cgi-bin/guess_op.fcgi?action=2&act_id=3&user_answer=${answer}&date=${guessDate}&channel=1&_=${rndtime}&openid=${app_openid}&fskey=${app_fskey}&access_token=${app_token}&_appName=${app_appName}&_appver=${app_appver}&_osVer=${app_osVer}&_devId=${app_devId}`,
            headers: {
                'Cookie': app_ck,
                'Accept': `application/json, text/plain, */*`,
                'Connection': `keep-alive`,
                'Referer': `https://zqact.tenpay.com/activity/page/guessRiseFall/`,
                'Accept-Encoding': `gzip, deflate, br`,
                'Host': `zqact.tenpay.com`,
                'User-Agent': app_UA,
                'Accept-Language': `zh-cn`
            },
        };
        $.get(url, async (err, resp, data) => {
            try {
                if (err) {
                    console.log("腾讯自选股: API查询请求失败 ‼️‼️");
                    console.log(JSON.stringify(err));
                    $.logErr(err);
                } else {
                    if (safeGet(data)) {
                        let result = JSON.parse(data);
                        if(logDebug) console.log(result)
                        if(result.retcode == 0) {
                            guessStr = (answer==1) ? "猜涨" : "猜跌"
                            $.log(`用户${nickname[numUser]}猜涨跌成功：${guessStr}\n`);
                        } else {
                            $.log(`用户${nickname[numUser]}猜涨跌失败：${result.retmsg}\n`);
                        }
                    }
                }
            } catch (e) {
                $.logErr(e, resp);
            } finally {
                resolve();
            }
        });
    });
}
////////////////////////////////////////////////////////////////////

function time(time) {
  var date = new Date(time + 8 * 3600 * 1000);
  return date.toJSON().substr(0, 19).replace('T', ' ').replace(/-/g, '.');
}

function safeGet(data) {
  try {
    if (typeof JSON.parse(data) == "object") {
      return true;
    }
  } catch (e) {
    console.log(e);
    console.log(`服务器访问数据为空，请检查自身设备网络情况`);
    return false;
  }
}

function printCaller(){
    return (new Error()).stack.split("\n")[2].trim().split(" ")[1]
}

function formatDateTime(inputTime) {
  var date = new Date(inputTime);
  var y = date.getFullYear();
  var m = date.getMonth() + 1;
  m = m < 10 ? ('0' + m) : m;
  var d = date.getDate();
  d = d < 10 ? ('0' + d) : d;
  var h = date.getHours();
  h = h < 10 ? ('0' + h) : h;
  var minute = date.getMinutes();
  var second = date.getSeconds();
  minute = minute < 10 ? ('0' + minute) : minute;
  second = second < 10 ? ('0' + second) : second;
  return `${y}${m}${d}`;
};

function Env(t, e) {
  class s {
    constructor(t) {
      this.env = t
    }
    send(t, e = "GET") {
      t = "string" == typeof t ? {
        url: t
      } : t;
      let s = this.get;
      return "POST" === e && (s = this.post), new Promise((e, i) => {
        s.call(this, t, (t, s, r) => {
          t ? i(t) : e(s)
        })
      })
    }
    get(t) {
      return this.send.call(this.env, t)
    }
    post(t) {
      return this.send.call(this.env, t, "POST")
    }
  }
  return new class {
    constructor(t, e) {
      this.name = t, this.http = new s(this), this.data = null, this.dataFile = "box.dat", this.logs = [], this.isMute = !1, this.isNeedRewrite = !1, this.logSeparator = "\n", this.startTime = (new Date).getTime(), Object.assign(this, e), this.log("", `\ud83d\udd14${this.name}, \u5f00\u59cb!`)
    }
    isNode() {
      return "undefined" != typeof module && !!module.exports
    }
    isQuanX() {
      return "undefined" != typeof $task
    }
    isSurge() {
      return "undefined" != typeof $httpClient && "undefined" == typeof $loon
    }
    isLoon() {
      return "undefined" != typeof $loon
    }
    toObj(t, e = null) {
      try {
        return JSON.parse(t)
      } catch {
        return e
      }
    }
    toStr(t, e = null) {
      try {
        return JSON.stringify(t)
      } catch {
        return e
      }
    }
    getjson(t, e) {
      let s = e;
      const i = this.getdata(t);
      if (i) try {
        s = JSON.parse(this.getdata(t))
      } catch {}
      return s
    }
    setjson(t, e) {
      try {
        return this.setdata(JSON.stringify(t), e)
      } catch {
        return !1
      }
    }
    getScript(t) {
      return new Promise(e => {
        this.get({
          url: t
        }, (t, s, i) => e(i))
      })
    }
    runScript(t, e) {
      return new Promise(s => {
        let i = this.getdata("@chavy_boxjs_userCfgs.httpapi");
        i = i ? i.replace(/\n/g, "").trim() : i;
        let r = this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout");
        r = r ? 1 * r : 20, r = e && e.timeout ? e.timeout : r;
        const [o, h] = i.split("@"), a = {
          url: `http://${h}/v1/scripting/evaluate`,
          body: {
            script_text: t,
            mock_type: "cron",
            timeout: r
          },
          headers: {
            "X-Key": o,
            Accept: "*/*"
          }
        };
        this.post(a, (t, e, i) => s(i))
      }).catch(t => this.logErr(t))
    }
    loaddata() {
      if (!this.isNode()) return {}; {
        this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path");
        const t = this.path.resolve(this.dataFile),
          e = this.path.resolve(process.cwd(), this.dataFile),
          s = this.fs.existsSync(t),
          i = !s && this.fs.existsSync(e);
        if (!s && !i) return {}; {
          const i = s ? t : e;
          try {
            return JSON.parse(this.fs.readFileSync(i))
          } catch (t) {
            return {}
          }
        }
      }
    }
    writedata() {
      if (this.isNode()) {
        this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path");
        const t = this.path.resolve(this.dataFile),
          e = this.path.resolve(process.cwd(), this.dataFile),
          s = this.fs.existsSync(t),
          i = !s && this.fs.existsSync(e),
          r = JSON.stringify(this.data);
        s ? this.fs.writeFileSync(t, r) : i ? this.fs.writeFileSync(e, r) : this.fs.writeFileSync(t, r)
      }
    }
    lodash_get(t, e, s) {
      const i = e.replace(/\[(\d+)\]/g, ".$1").split(".");
      let r = t;
      for (const t of i)
        if (r = Object(r)[t], void 0 === r) return s;
      return r
    }
    lodash_set(t, e, s) {
      return Object(t) !== t ? t : (Array.isArray(e) || (e = e.toString().match(/[^.[\]]+/g) || []), e.slice(0, -1).reduce((t, s, i) => Object(t[s]) === t[s] ? t[s] : t[s] = Math.abs(e[i + 1]) >> 0 == +e[i + 1] ? [] : {}, t)[e[e.length - 1]] = s, t)
    }
    getdata(t) {
      let e = this.getval(t);
      if (/^@/.test(t)) {
        const [, s, i] = /^@(.*?)\.(.*?)$/.exec(t), r = s ? this.getval(s) : "";
        if (r) try {
          const t = JSON.parse(r);
          e = t ? this.lodash_get(t, i, "") : e
        } catch (t) {
          e = ""
        }
      }
      return e
    }
    setdata(t, e) {
      let s = !1;
      if (/^@/.test(e)) {
        const [, i, r] = /^@(.*?)\.(.*?)$/.exec(e), o = this.getval(i), h = i ? "null" === o ? null : o || "{}" : "{}";
        try {
          const e = JSON.parse(h);
          this.lodash_set(e, r, t), s = this.setval(JSON.stringify(e), i)
        } catch (e) {
          const o = {};
          this.lodash_set(o, r, t), s = this.setval(JSON.stringify(o), i)
        }
      } else s = this.setval(t, e);
      return s
    }
    getval(t) {
      return this.isSurge() || this.isLoon() ? $persistentStore.read(t) : this.isQuanX() ? $prefs.valueForKey(t) : this.isNode() ? (this.data = this.loaddata(), this.data[t]) : this.data && this.data[t] || null
    }
    setval(t, e) {
      return this.isSurge() || this.isLoon() ? $persistentStore.write(t, e) : this.isQuanX() ? $prefs.setValueForKey(t, e) : this.isNode() ? (this.data = this.loaddata(), this.data[e] = t, this.writedata(), !0) : this.data && this.data[e] || null
    }
    initGotEnv(t) {
      this.got = this.got ? this.got : require("got"), this.cktough = this.cktough ? this.cktough : require("tough-cookie"), this.ckjar = this.ckjar ? this.ckjar : new this.cktough.CookieJar, t && (t.headers = t.headers ? t.headers : {}, void 0 === t.headers.Cookie && void 0 === t.cookieJar && (t.cookieJar = this.ckjar))
    }
    get(t, e = (() => {})) {
      t.headers && (delete t.headers["Content-Type"], delete t.headers["Content-Length"]), this.isSurge() || this.isLoon() ? (this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, {
        "X-Surge-Skip-Scripting": !1
      })), $httpClient.get(t, (t, s, i) => {
        !t && s && (s.body = i, s.statusCode = s.status), e(t, s, i)
      })) : this.isQuanX() ? (this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, {
        hints: !1
      })), $task.fetch(t).then(t => {
        const {
          statusCode: s,
          statusCode: i,
          headers: r,
          body: o
        } = t;
        e(null, {
          status: s,
          statusCode: i,
          headers: r,
          body: o
        }, o)
      }, t => e(t))) : this.isNode() && (this.initGotEnv(t), this.got(t).on("redirect", (t, e) => {
        try {
          if (t.headers["set-cookie"]) {
            const s = t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString();
            this.ckjar.setCookieSync(s, null), e.cookieJar = this.ckjar
          }
        } catch (t) {
          this.logErr(t)
        }
      }).then(t => {
        const {
          statusCode: s,
          statusCode: i,
          headers: r,
          body: o
        } = t;
        e(null, {
          status: s,
          statusCode: i,
          headers: r,
          body: o
        }, o)
      }, t => {
        const {
          message: s,
          response: i
        } = t;
        e(s, i, i && i.body)
      }))
    }
    post(t, e = (() => {})) {
      if (t.body && t.headers && !t.headers["Content-Type"] && (t.headers["Content-Type"] = "application/x-www-form-urlencoded"), t.headers && delete t.headers["Content-Length"], this.isSurge() || this.isLoon()) this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, {
        "X-Surge-Skip-Scripting": !1
      })), $httpClient.post(t, (t, s, i) => {
        !t && s && (s.body = i, s.statusCode = s.status), e(t, s, i)
      });
      else if (this.isQuanX()) t.method = "POST", this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, {
        hints: !1
      })), $task.fetch(t).then(t => {
        const {
          statusCode: s,
          statusCode: i,
          headers: r,
          body: o
        } = t;
        e(null, {
          status: s,
          statusCode: i,
          headers: r,
          body: o
        }, o)
      }, t => e(t));
      else if (this.isNode()) {
        this.initGotEnv(t);
        const {
          url: s,
          ...i
        } = t;
        this.got.post(s, i).then(t => {
          const {
            statusCode: s,
            statusCode: i,
            headers: r,
            body: o
          } = t;
          e(null, {
            status: s,
            statusCode: i,
            headers: r,
            body: o
          }, o)
        }, t => {
          const {
            message: s,
            response: i
          } = t;
          e(s, i, i && i.body)
        })
      }
    }
    time(t) {
      let e = {
        "M+": (new Date).getMonth() + 1,
        "d+": (new Date).getDate(),
        "H+": (new Date).getHours(),
        "m+": (new Date).getMinutes(),
        "s+": (new Date).getSeconds(),
        "q+": Math.floor(((new Date).getMonth() + 3) / 3),
        S: (new Date).getMilliseconds()
      };
      /(y+)/.test(t) && (t = t.replace(RegExp.$1, ((new Date).getFullYear() + "").substr(4 - RegExp.$1.length)));
      for (let s in e) new RegExp("(" + s + ")").test(t) && (t = t.replace(RegExp.$1, 1 == RegExp.$1.length ? e[s] : ("00" + e[s]).substr(("" + e[s]).length)));
      return t
    }
    msg(e = t, s = "", i = "", r) {
      const o = t => {
        if (!t) return t;
        if ("string" == typeof t) return this.isLoon() ? t : this.isQuanX() ? {
          "open-url": t
        } : this.isSurge() ? {
          url: t
        } : void 0;
        if ("object" == typeof t) {
          if (this.isLoon()) {
            let e = t.openUrl || t.url || t["open-url"],
              s = t.mediaUrl || t["media-url"];
            return {
              openUrl: e,
              mediaUrl: s
            }
          }
          if (this.isQuanX()) {
            let e = t["open-url"] || t.url || t.openUrl,
              s = t["media-url"] || t.mediaUrl;
            return {
              "open-url": e,
              "media-url": s
            }
          }
          if (this.isSurge()) {
            let e = t.url || t.openUrl || t["open-url"];
            return {
              url: e
            }
          }
        }
      };
      this.isMute || (this.isSurge() || this.isLoon() ? $notification.post(e, s, i, o(r)) : this.isQuanX() && $notify(e, s, i, o(r)));
      let h = ["", "==============\ud83d\udce3\u7cfb\u7edf\u901a\u77e5\ud83d\udce3=============="];
      h.push(e), s && h.push(s), i && h.push(i), console.log(h.join("\n")), this.logs = this.logs.concat(h)
    }
    log(...t) {
      t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(t.join(this.logSeparator))
    }
    logErr(t, e) {
      const s = !this.isSurge() && !this.isQuanX() && !this.isLoon();
      s ? this.log("", `\u2757\ufe0f${this.name}, \u9519\u8bef!`, t.stack) : this.log("", `\u2757\ufe0f${this.name}, \u9519\u8bef!`, t)
    }
    wait(t) {
      return new Promise(e => setTimeout(e, t))
    }
    done(t = {}) {
      const e = (new Date).getTime(),
        s = (e - this.startTime) / 1e3;
      this.log("", `\ud83d\udd14${this.name}, \u7ed3\u675f! \ud83d\udd5b ${s} \u79d2`), this.log(), (this.isSurge() || this.isQuanX() || this.isLoon()) && $done(t)
    }
  }(t, e)
}
