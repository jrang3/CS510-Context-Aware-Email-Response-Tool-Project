// Constants for styling
//var ICON_URL   = 'https://img.icons8.com/?size=100&id=COXH7oTJANyS&format=png&color=000000';
var ICON_URL   = 'https://img.icons8.com/?size=100&id=eoxMN35Z6JKg&format=png&color=000000';
var AVATAR_URL = 'https://img.icons8.com/?size=100&id=eoxMN35Z6JKg&format=png&color=000000';

/**
 * Contextual trigger – fires when you open a thread.
 */
function generateReply(e) {
  try {
    GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);
    var messageId = e.gmail.messageId;
    var thread    = GmailApp.getMessageById(messageId).getThread();
    var msgs      = thread.getMessages();

    // Build preview of all messages in the thread
    var preview = '';
    for (var i = 0; i < msgs.length; i++) {
      var m    = msgs[i];
      var body = m.getPlainBody().replace(/\r?\n/g, ' ');
      preview += m.getFrom() + ': ' + body.slice(0, 80) + '…';
      if (i < msgs.length - 1) preview += '\n\n';
    }

    // Collect attachments metadata
    var attachments = [];
    for (var mi = 0; mi < msgs.length; mi++) {
      var atts = msgs[mi].getAttachments({ includeInlineImages: false });
      for (var ai = 0; ai < atts.length; ai++) {
        var a = atts[ai];
        attachments.push({
          name: a.getName(),
          sizeKb: Math.round(a.getSize() / 1024),
          messageIndex: mi,
          attachmentIndex: ai
        });
      }
    }

    // Build the UI card
    var builder = CardService.newCardBuilder()
      .setHeader(
        CardService.newCardHeader()
          .setTitle('Smart Email Reply')
          .setSubtitle('Instant smarter replies')
          .setImageUrl(ICON_URL)
      )
      .addSection(
        CardService.newCardSection()
          .setHeader('Conversation Preview')
          .addWidget(
            CardService.newKeyValue()
              .setTopLabel('Recent Messages')
              .setContent(preview)
              .setIconUrl(AVATAR_URL)
              .setMultiline(true)
          )
      )
      .addSection(
        CardService.newCardSection()
          .setHeader('Reply Language')
          .addWidget(
            CardService.newSelectionInput()
              .setType(CardService.SelectionInputType.DROPDOWN)
              .setFieldName('language')
              .addItem('English', 'English', true)
              .addItem('Spanish', 'Spanish', false)
              .addItem('French', 'French', false)
              .addItem('Chinese', 'Chinese', false)
          )
      )
      .addSection(
        CardService.newCardSection()
          .setHeader('Reply Tone')
          .addWidget(
            CardService.newSelectionInput()
              .setType(CardService.SelectionInputType.DROPDOWN)
              .setFieldName('tone')
              .addItem('Formal', 'Formal', true)
              .addItem('Casual', 'Casual', false)
          )
      )
      // .addSection(
      //   CardService.newCardSection()
      //     .setHeader('Draft Reply')
      //     .addWidget(
      //       CardService.newTextInput()
      //         .setFieldName('replyText')
      //         .setTitle('Message')
      //         .setMultiline(true)
      //     )
      // )
       .addSection(
         CardService.newCardSection()
           .setHeader('Custom Instructions')
           .addWidget(
             CardService.newTextInput()
               .setFieldName('customPrompt')
               .setTitle('Or enter your own instruction')
               .setHint('e.g. Summarize positively in two sentences…')
               .setMultiline(true)
           )
      );

    // Attachments picker
    if (attachments.length > 0) {
      var attSection = CardService.newCardSection().setHeader('Attachments');
      var sel = CardService.newSelectionInput()
        .setType(CardService.SelectionInputType.CHECK_BOX)
        .setFieldName('attach')
        .setTitle('Include attachments');
      attachments.forEach(function(info, j) {
        sel.addItem(
          info.name + ' (' + info.sizeKb + ' KB)',
          String(j),
          false
        );
      });
      attSection.addWidget(sel);
      builder.addSection(attSection);
    }

    // Footer: Compose & Generate
    builder.setFixedFooter(
      CardService.newFixedFooter()
        .setPrimaryButton(
          CardService.newTextButton()
            .setText('Compose in Gmail')
            .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
            .setComposeAction(
              CardService.newAction().setFunctionName('composeInGmail'),
              CardService.ComposedEmailType.REPLY_AS_DRAFT
            )
        )
        .setSecondaryButton(
          CardService.newTextButton()
            .setText('Generate Reply')
            .setOnClickAction(
              CardService.newAction().setFunctionName('regenerateReply')
            )
        )
    );

    return builder.build();

  } catch (err) {
    return buildErrorCard('generateReply failed: ' + err.message);
  }
}

/**
 * Regenerate using selected language, tone & optional custom prompt.
 * If the user enters a custom prompt, we append it to the built-in one
 * rather than replacing it completely.
 */
function regenerateReply(e) {
  try {
    GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);
    var messageId = e.gmail.messageId;
    var thread    = GmailApp.getMessageById(messageId).getThread();
    var msgs      = thread.getMessages();

    // Rebuild preview of all messages
    var preview = '';
    for (var i = 0; i < msgs.length; i++) {
      var m    = msgs[i];
      var body = m.getPlainBody().replace(/\r?\n/g, ' ');
      preview += m.getFrom() + ': ' + body.slice(0, 80) + '…';
      if (i < msgs.length - 1) preview += '\n\n';
    }

    // User selections
    var lang   = e.formInput.language || 'English';
    var tone   = e.formInput.tone     || 'Formal';
    var custom = (e.formInput.customPrompt || '').trim();

    // Build the base prompt
    var basePrompt = 
      'You are an intelligent email assistant. ' +
      'Write one ' + tone.toLowerCase() +
      ' reply in ' + lang +
      ' to this thread. Only give one reply please:\n\n' + preview;

    // If the user provided extra instructions, append them
    var prompt = custom 
      ? basePrompt + '\n\nAdditional instructions: ' + custom 
      : basePrompt;

    // Call Gemini
    var suggestion = callGemini(prompt);

    // Rebuild the card with the new suggestion
    var builder = CardService.newCardBuilder()
      .setHeader(
        CardService.newCardHeader()
          .setTitle('Generated Reply')
          .setSubtitle(custom ? 'Custom prompt appended' : 'Auto-generated')
          .setImageUrl(ICON_URL)
      )
      .addSection(
        CardService.newCardSection()
          .addWidget(
            CardService.newTextInput()
              .setFieldName('replyText')
              .setValue(suggestion)
              .setMultiline(true)
          )
      )
      .addSection(
        CardService.newCardSection()
          .setHeader('Custom Prompt')
          .addWidget(
            CardService.newTextInput()
              .setFieldName('customPrompt')
              .setValue(custom)
              .setHint('Enter extra instructions…')
              .setMultiline(true)
          )
      )
      .setFixedFooter(
        CardService.newFixedFooter()
          .setPrimaryButton(
            CardService.newTextButton()
              .setText('Compose in Gmail')
              .setComposeAction(
                CardService.newAction().setFunctionName('composeInGmail'),
                CardService.ComposedEmailType.REPLY_AS_DRAFT
              )
          )
          .setSecondaryButton(
            CardService.newTextButton()
              .setText('Regenerate')
              .setOnClickAction(
                CardService.newAction().setFunctionName('regenerateReply')
              )
          )
      );

    return builder.build();

  } catch (err) {
    return buildErrorCard('regenerateReply failed: ' + err.message);
  }
}

/**
 * Opens Gmail compose as a reply, preserving line breaks and attachments.
 */
function composeInGmail(e) {
  try {
    var plainBody = e.formInput.replyText || '';
    var htmlBody  = escapeHtml(plainBody).replace(/\r?\n/g, '<br>');

    var message = GmailApp.getMessageById(e.gmail.messageId);
    var thread  = message.getThread();
    var msgs    = thread.getMessages();
    var info    = attachmentsInfo(msgs);
    var picks   = e.formInput.attach || [];
    if (!Array.isArray(picks)) picks = [picks];
    var blobs   = picks.map(function(p) {
      var inf = info[parseInt(p,10)];
      return msgs[inf.messageIndex]
               .getAttachments({includeInlineImages:false})[inf.attachmentIndex];
    });

    // Create the reply draft
    var draft = message.createDraftReply(plainBody, {
      htmlBody:    htmlBody,
      attachments: blobs
    });

    return CardService.newComposeActionResponseBuilder()
      .setGmailDraft(draft)
      .build();

  } catch (err) {
    return buildErrorCard('composeInGmail failed: ' + err.message);
  }
}

/**
 * Helper: gather attachments info.
 */
function attachmentsInfo(msgs) {
  var info = [];
  msgs.forEach(function(m, mi) {
    m.getAttachments({ includeInlineImages: false })
     .forEach(function(a, ai) {
       info.push({ messageIndex: mi, attachmentIndex: ai });
     });
  });
  return info;
}

/**
 * Escapes &, <, >, " and ' so we can safely inject HTML line breaks.
 */
function escapeHtml(text) {
  return (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Calls the Gemini REST endpoint.
 */
function callGemini(prompt) {
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_KEY');
  if (!key) throw new Error('GEMINI_KEY not set');
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/'
          + 'gemini-2.0-flash:generateContent?key='
          + key;
  var payload = { contents: [{ parts: [{ text: prompt }] }] };
  var opts = {
    method:            'post',
    contentType:       'application/json',
    payload:           JSON.stringify(payload),
    muteHttpExceptions:true
  };
  var res  = UrlFetchApp.fetch(url, opts);
  var code = res.getResponseCode();
  var body = res.getContentText();
  if (code < 200 || code > 299) {
    throw new Error('generateContent failed ' + code + ': ' + body);
  }
  var json = JSON.parse(body);
  return (json.candidates && json.candidates[0] &&
          json.candidates[0].content.parts[0].text)
    || 'No response generated.';
}

/**
 * Builds a simple error card.
 */
function buildErrorCard(message) {
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Error'))
    .addSection(
      CardService.newCardSection()
        .addWidget(
          CardService.newTextParagraph().setText('⚠ ' + message)
        )
    )
    .build();
}
