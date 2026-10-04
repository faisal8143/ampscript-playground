/* Example templates for the AMPscript Playground. All data is made up. */
window.AMP_EXAMPLES = [
  {
    id: 'welcome',
    name: 'Welcome email with tier logic',
    note: 'Personalisation strings, AttributeValue, Lookup and IF / ELSEIF.',
    template: [
      '%%[',
      '  /* Who is this? */',
      '  VAR @first, @tier, @points',
      '  SET @first = ProperCase(AttributeValue("FirstName"))',
      '  IF Empty(@first) THEN SET @first = "there" ENDIF',
      '',
      '  /* Loyalty tier from a data extension */',
      '  SET @tier = Lookup("Loyalty_Members", "Tier", "SubscriberKey", _subscriberkey)',
      '  SET @points = Lookup("Loyalty_Members", "Points", "SubscriberKey", _subscriberkey)',
      ']%%',
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:Arial,sans-serif;background:#f4f4f4;">',
      '  <tr><td align="center" style="padding:24px 12px;">',
      '    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;">',
      '      <tr><td style="background:#123c3c;color:#ffffff;padding:28px 32px;font-size:24px;font-weight:bold;">Welcome, %%=v(@first)=%%</td></tr>',
      '      <tr><td style="padding:28px 32px;font-size:16px;line-height:24px;color:#333333;">',
      '%%[ IF @tier == "Gold" THEN ]%%',
      '        <p style="margin:0 0 16px;">As a <strong>Gold member</strong> you get free express shipping on every order.</p>',
      '%%[ ELSEIF @tier == "Silver" THEN ]%%',
      '        <p style="margin:0 0 16px;">You\'re a <strong>Silver member</strong>. Spend $200 more to reach Gold.</p>',
      '%%[ ELSE ]%%',
      '        <p style="margin:0 0 16px;">Join our rewards club and earn points on every order.</p>',
      '%%[ ENDIF ]%%',
      '%%[ IF NOT Empty(@points) THEN ]%%',
      '        <p style="margin:0 0 16px;">Points balance: <strong>%%=FormatNumber(@points, "N0")=%%</strong></p>',
      '%%[ ENDIF ]%%',
      '        <p style="margin:0;">Sent to %%emailaddr%% · <a href="%%profile_center_url%%" style="color:#0f6e6e;">Update preferences</a></p>',
      '      </td></tr>',
      '    </table>',
      '  </td></tr>',
      '</table>'
    ].join('\n'),
    subscriber: { SubscriberKey: '0035g00000AbCdE', FirstName: 'aMIRA', EmailAddress: 'amira@example.com' },
    dataExtensions: {
      Loyalty_Members: [
        { SubscriberKey: '0035g00000AbCdE', Tier: 'Gold', Points: 12840 },
        { SubscriberKey: '0035g00000XyZ12', Tier: 'Silver', Points: 3150 }
      ]
    },
    contentBlocks: {}
  },
  {
    id: 'orders',
    name: 'Order recap with a loop',
    note: 'LookupOrderedRows, FOR / NEXT, Field and FormatCurrency.',
    template: [
      '%%[',
      '  SET @orders = LookupOrderedRows("Orders", 3, "OrderDate desc", "Email", emailaddr)',
      '  SET @count = RowCount(@orders)',
      ']%%',
      '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#222;">',
      '  <h1 style="font-size:22px;margin:0 0 8px;">Hi %%FirstName%%, here are your latest orders</h1>',
      '%%[ IF @count > 0 THEN ]%%',
      '  <table width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse;font-size:15px;">',
      '    <tr style="background:#eef3f3;text-align:left;"><th>Order</th><th>Date</th><th align="right">Total</th></tr>',
      '%%[ FOR @i = 1 TO @count DO',
      '     SET @row = Row(@orders, @i) ]%%',
      '    <tr style="border-bottom:1px solid #e3e3e3;">',
      '      <td>#%%=Field(@row, "OrderId")=%%</td>',
      '      <td>%%=FormatDate(Field(@row, "OrderDate"), "d MMM yyyy")=%%</td>',
      '      <td align="right">%%=FormatCurrency(Field(@row, "Total"), "en-AU")=%%</td>',
      '    </tr>',
      '%%[ NEXT @i ]%%',
      '  </table>',
      '%%[ ELSE ]%%',
      '  <p>No orders yet. <a href="https://example.com/shop">Start shopping</a></p>',
      '%%[ ENDIF ]%%',
      '</div>'
    ].join('\n'),
    subscriber: { FirstName: 'Liam', EmailAddress: 'liam@example.com' },
    dataExtensions: {
      Orders: [
        { OrderId: 'A1042', Email: 'liam@example.com', OrderDate: '2026-09-28', Total: 189.95 },
        { OrderId: 'A0988', Email: 'liam@example.com', OrderDate: '2026-08-14', Total: 64.5 },
        { OrderId: 'A0931', Email: 'liam@example.com', OrderDate: '2026-07-02', Total: 1240 },
        { OrderId: 'A0870', Email: 'liam@example.com', OrderDate: '2026-05-19', Total: 22 },
        { OrderId: 'A0866', Email: 'zoe@example.com', OrderDate: '2026-09-30', Total: 75 }
      ]
    },
    contentBlocks: {}
  },
  {
    id: 'dates',
    name: 'Birthday offer with dates',
    note: 'Change the send date to see the offer switch on and off.',
    template: [
      '%%[',
      '  SET @birthday = AttributeValue("Birthday")',
      '  SET @thisYear = Concat(DatePart(@birthday, "M"), "/", DatePart(@birthday, "D"), "/", DatePart(Now(), "Y"))',
      '  SET @daysUntil = DateDiff(Now(), @thisYear, "D")',
      '  SET @expires = DateAdd(Now(), 14, "D")',
      '  SET @code = Concat("BDAY-", Uppercase(Substring(AttributeValue("FirstName"), 1, 3)), DatePart(Now(), "Y"))',
      ']%%',
      '<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;padding:28px;background:#fff8ef;color:#3b2a1a;">',
      '%%[ IF @daysUntil >= 0 AND @daysUntil <= 7 THEN ]%%',
      '  <h1 style="margin:0 0 12px;">Happy early birthday, %%FirstName%%!</h1>',
      '  <p>Your birthday is %%=IIF(@daysUntil == 0, "today", Concat("in ", @daysUntil, " days"))=%%. Here is 20% off, on us.</p>',
      '  <p style="font-size:22px;letter-spacing:2px;"><strong>%%=v(@code)=%%</strong></p>',
      '  <p style="font-size:13px;">Valid until %%=FormatDate(@expires, "dddd d MMMM")=%%.</p>',
      '%%[ ELSE ]%%',
      '  <h1 style="margin:0 0 12px;">Hi %%FirstName%%</h1>',
      '  <p>Your birthday treat arrives the week before %%=FormatDate(@thisYear, "d MMMM")=%%.</p>',
      '%%[ ENDIF ]%%',
      '</div>'
    ].join('\n'),
    subscriber: { FirstName: 'Sana', Birthday: '1994-10-09', EmailAddress: 'sana@example.com' },
    dataExtensions: {},
    contentBlocks: {}
  },
  {
    id: 'content',
    name: 'Content blocks and dynamic sections',
    note: 'ContentBlockByKey, BuildRowsetFromString and TreatAsContent.',
    template: [
      '%%[',
      '  SET @interests = AttributeValue("Interests")',
      '  SET @list = BuildRowsetFromString(@interests, ",")',
      ']%%',
      '%%=ContentBlockByKey("header")=%%',
      '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:0 24px;">',
      '  <h2 style="font-size:18px;">Picked for you</h2>',
      '%%[ FOR @i = 1 TO RowCount(@list) DO',
      '     SET @topic = Trim(Field(Row(@list, @i), 1))',
      '     SET @blurb = Lookup("Topic_Content", "Blurb", "Topic", @topic) ]%%',
      '  <p><strong>%%=ProperCase(@topic)=%%:</strong> %%=TreatAsContent(@blurb)=%%</p>',
      '%%[ NEXT @i ]%%',
      '</div>',
      '%%=ContentBlockByKey("footer")=%%'
    ].join('\n'),
    subscriber: { FirstName: 'Noah', Interests: 'hiking, coffee, design', EmailAddress: 'noah@example.com' },
    dataExtensions: {
      Topic_Content: [
        { Topic: 'hiking', Blurb: 'Five day walks within two hours of the city, %%FirstName%%.' },
        { Topic: 'coffee', Blurb: 'Our new single-origin from Sidamo is in.' },
        { Topic: 'design', Blurb: 'Studio tour: how we built the autumn range.' }
      ]
    },
    contentBlocks: {
      header: '<div style="background:#123c3c;color:#fff;padding:20px 24px;font:bold 20px Arial,sans-serif;">Weekly picks</div>',
      footer: '<p style="font:12px Arial,sans-serif;color:#777;padding:16px 24px;">You get this because you signed up at example.com. <a href="%%unsub_center_url%%">Unsubscribe</a></p>'
    }
  },
  {
    id: 'cloudpage',
    name: 'CloudPage form handler',
    note: 'RequestParameter, IsEmailAddress and UpsertData. Watch the Log tab.',
    template: [
      '%%[',
      '  SET @email = Trim(RequestParameter("email"))',
      '  SET @topic = RequestParameter("topic")',
      '',
      '  IF IsEmailAddress(@email) THEN',
      '    UpsertData("Newsletter_Signups", 1, "Email", @email, "Topic", @topic, "SignedUp", Now())',
      '    SET @status = "ok"',
      '  ELSE',
      '    SET @status = "invalid"',
      '  ENDIF',
      ']%%',
      '<div style="font-family:Arial,sans-serif;max-width:420px;margin:40px auto;padding:24px;border:1px solid #ddd;">',
      '%%[ IF @status == "ok" THEN ]%%',
      '  <h2>You\'re in!</h2>',
      '  <p>We\'ll send %%=Lowercase(@topic)=%% news to %%=v(@email)=%%.</p>',
      '  <p style="color:#777;font-size:13px;">Signups in this data extension: %%=DataExtensionRowCount("Newsletter_Signups")=%%</p>',
      '%%[ ELSE ]%%',
      '  <h2>Check your email address</h2>',
      '  <p>"%%=v(@email)=%%" doesn\'t look right. Please go back and try again.</p>',
      '%%[ ENDIF ]%%',
      '</div>'
    ].join('\n'),
    subscriber: {},
    requestParameters: { email: ' maya@example.com ', topic: 'Product' },
    dataExtensions: { Newsletter_Signups: [{ Email: 'old@example.com', Topic: 'Events', SignedUp: '2026-01-10' }] },
    contentBlocks: {}
  }
];
