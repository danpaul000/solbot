import PriceService from '../../../price/PriceService';
import Wallet from '../../../wallet';
import UserService from '../../../publicKeyStorage/UserService';
import { COMMAND_PREFIX } from '../../../config';

const getCurrentSolPriceInUSD = async () => {
  try {
    return await PriceService.getSolPriceInUSD();
  } catch {
    return false;
  }
};

const getUserFromMention = (mention) => {
  const matches = mention.match(/^<@!?(\d+)>$/);
  if (!matches) {
    return null;
  }
  return matches[1];
};

export default {
  name: 'send',
  description: 'Lets you send SOL to someone on the currently selected cluster. To specify the recipient,'
      + 'you can use a public key or tag someone with @<username> someone. You must be logged in to use this command.'
      + ' When !sending in a public channel, no balance or tx info will be shown after the tx has completed.',
  usage: [`${COMMAND_PREFIX}send 5 GsbwXfJraMomNxBcjYLcG3mxkBUiyWXAB32fGbSMQRdW`, `${COMMAND_PREFIX}send 5 @<username>`],
  async execute(message, args) {
    if (args.length !== 3) {
      message.channel.send('⚠️ Wrong number of arguments ⚠️');
      return;
    }

    const solToSend = parseFloat(args[1]);
    let toPublicKeyString = args[2];

    let recipientId;
    if (!Wallet.isValidPublicKey(args[2])) {
      recipientId = getUserFromMention(args[2]);
      if (!recipientId) {
        message.channel.send('⚠️ Given recipient is neither a public key nor a user ⚠️');
        return;
      }
      const recipient = await UserService.getUser(recipientId);
      if (!recipient) {
        message.channel.send('⚠️ Given recipient has not registered a discord public key ⚠️');
        return;
      }

      toPublicKeyString = recipient.publicKey;
    }

    // eslint-disable-next-line no-restricted-globals
    if (isNaN(solToSend) || solToSend <= 0) {
      message.channel.send('⚠️ Invalid sol amount ⚠️');
      return;
    }

    message.channel.send('Sending...');

    const userId = message.author.id;
    const cluster = await Wallet.getCluster(userId);
    const keypair = await Wallet.getKeyPair(userId);
    const { privateKey } = keypair;

    let signature = '';
    try {
      signature = await Wallet
        .transfer(cluster, Object.values(privateKey), toPublicKeyString, solToSend);
    } catch (e) {
      message.channel.send(e.message);
      return;
    }

    const currentPrice = await getCurrentSolPriceInUSD();

    const dollarValue = currentPrice
      ? await PriceService.getDollarValueForSol(solToSend, currentPrice)
      : null;

    const recipient = recipientId ? `<@${recipientId}>` : toPublicKeyString;

    const txLink = `<https://explorer.solana.com/tx/${signature}?cluster=${cluster}>`;
    const data = [];
    data.push(`💸 Successfully sent ${solToSend} SOL ${dollarValue ? `(~$${dollarValue}) ` : ''}to ${recipient} on cluster: ${cluster} 💸`);
    data.push('Click the link to see when your tx has been finalized (reached MAX confirmations)!');
    data.push(`${txLink}`);
    message.channel.send(data);
  },
};
