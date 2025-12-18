import { ethers } from "ethers";
import type { GetStaticProps } from "next";
import Head from "next/head";
import { useEffect, useState } from "react";
import VoteEvenOrOdd from "../artifacts/contracts/circuits/VoteEvenOrOdd.sol/VoteEvenOrOdd.json";
import { useZokrates } from "../contexts/ZokratesContext";
import { arrayBufferToBase64, base64ToArrayBuffer } from "../utils/converter";
import { getProvider, getVoteAddress } from "../utils/web3";

const TxMessage = ({ txHash }: { txHash: string }) => {
  const shortHash = (h: string) => h.slice(0, 20) + "..." + h.slice(-4);
  return (
    <div className="mt-2 p-3 bg-green-50 rounded-md border border-green-200">
      <p className="text-sm text-green-700 font-medium">Giao dịch đã được gửi thành công!</p>
      <p className="text-xs text-gray-500 mt-1">Mã giao dịch (Tx Hash):</p>
      <code className="text-xs break-all text-indigo-600 font-mono">{txHash}</code>
    </div>
  );
};
interface HomeProps {
  proveKeyString: string;
  programString: string;
}

function Home({ proveKeyString, programString }: HomeProps) {
  const [provider, setProvider] =
    useState<ethers.providers.JsonRpcProvider | null>(null);
  const [voteResult, setVoteResult] = useState<{ even: number; odd: number }>({
    even: 0,
    odd: 0,
  });

  const exportToCSV = () => {
    const data = [
      ["Candidate", "Votes"],
      ["Cử tri A (Hồ Văn A)", voteResult.even],
      ["Cử tri B (Trần Thị B)", voteResult.odd],
    ];
    const csvContent = "\uFEFF" + data.map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "ket_qua_bau_chon.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const [amount, setAmount] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const zk = useZokrates();

  async function requestAccount() {
    await window.ethereum.request({ method: "eth_requestAccounts" });
  }

  async function fetchVote() {
    if (typeof window.ethereum !== "undefined") {
      // const provider = new ethers.providers.Web3Provider(window.ethereum);
      const provider = getProvider();
      const contract = new ethers.Contract(
        getVoteAddress(),
        VoteEvenOrOdd.abi,
        provider
      );
      setProvider(provider);
      try {
        const even = await contract.votes(0);
        const odd = await contract.votes(1);
        setVoteResult({ even, odd });
      } catch (err) {
        console.log("Error: ", err);
      }
    }
  }

  useEffect(() => {
    fetchVote();
  }, []);

  const handleChangeAmount = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) {
      setAmount(e.target.value);
    } else {
      setAmount(null);
    }
  };

  const handleSubmit = async (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>
  ) => {
    e.preventDefault();
    if (!zk) {
      console.log("ZK not ready");
      return;
    }
    if (typeof window.ethereum !== "undefined") {
      setLoading(true);
      await requestAccount();
      const signer = provider.getSigner();
      const contract = new ethers.Contract(
        getVoteAddress(),
        VoteEvenOrOdd.abi,
        signer
      );
      try {
        console.log("ZK compile");
        // compilation
        const artifacts = zk.compile(programString);
        console.log("ZK artifacts");
        const { witness, output } = zk.computeWitness(artifacts, [amount]);
        console.log("ZK witness");
        // generate proof
        const proveKey = base64ToArrayBuffer(proveKeyString);
        console.log("ProveKey", proveKey.byteLength);
        const { proof, inputs } = zk.generateProof(
          artifacts.program,
          witness,
          proveKey
        );
        console.log("ZK proof", { proof });
        const transaction = await contract.vote(
          proof.a,
          proof.b,
          proof.c,
          inputs
        );
        const receipt = await transaction.wait();
        setTxHash(receipt.transactionHash);
        fetchVote();
      } catch (e) {
        console.log("Error", e);
        setTxHash(null);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="flex-auto">
      <Head>
        <title>ZKP Vote</title>
        <meta name="description" content="PoC of ZKP" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="p-6">
        <p className="text-4xl font-bold pb-8 text-indigo-900">Hệ thống Bầu chọn Bảo mật (ZKP)</p>
        <form action="#" method="POST">
          <div className="shadow rounded-md overflow-hidden ">
            <div className="px-4 py-5 bg-white space-y-6 sm:p-6">
              <div>
                <div className="block text-sm font-medium text-gray-700 pb-2">
                  {`Nhập một số chẵn (0, 2, 4...) để bầu cho Cử tri A hoặc một số lẻ (1, 3, 5...) để bầu cho Cử tri B.\n
                  Số của bạn sẽ được giữ bí mật hoàn toàn nhờ công nghệ ZKP, chỉ có kết quả tổng hợp được cập nhật.`}
                </div>
                <div className="md:col-span-1">
                  <input
                    id="x"
                    name="x"
                    className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 my-2 block sm:text-sm border border-gray-300 rounded-md p-2"
                    placeholder="Nhập giá trị (0 - 255)"
                    inputMode="numeric"
                    onChange={handleChangeAmount}
                  />
                </div>

                {txHash && <TxMessage txHash={txHash} />}
                {loading && (
                  <div className="flex flex-row">
                    <p className="mt-2 text-sm text-gray-700">
                      Submitting your transaction. It may take 10 - 20 sec...
                    </p>
                    <img src="./spinner.svg" />
                  </div>
                )}
              </div>
              <button
                type="submit"
                className="inline-flex justify-center py-2 px-6 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-all transform hover:scale-105"
                onClick={handleSubmit}
                disabled={amount === null}
              >
                Bình chọn ngay
              </button>
            </div>
            <div className="p-6 bg-gray-50 sm:px-10 m-3 rounded-xl border border-gray-200">
              <div className="flex justify-between items-center pb-8">
                <p className="text-2xl font-bold text-gray-800">Kết quả hiện tại</p>
                <button
                  type="button"
                  onClick={exportToCSV}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                >
                  <svg className="-ml-1 mr-2 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Xuất file thống kê
                </button>
              </div>
              <div className="grid grid-cols-2 gap-8">
                <div className="col-span-1 text-center p-4 bg-white rounded-lg shadow-sm border border-indigo-100">
                  <img src="/candidate_a.png" alt="Candidate A" className="w-32 h-32 mx-auto rounded-full object-cover mb-4 border-4 border-indigo-500 shadow-md" />
                  <div className="text-lg font-bold text-gray-700">Cử tri A</div>
                  <div className="text-sm text-gray-500 mb-2">Hồ Văn A</div>
                  <div className="text-5xl font-black text-indigo-600">
                    {voteResult.even}
                  </div>
                </div>
                <div className="col-span-1 text-center p-4 bg-white rounded-lg shadow-sm border border-pink-100">
                  <img src="/candidate_b.png" alt="Candidate B" className="w-32 h-32 mx-auto rounded-full object-cover mb-4 border-4 border-pink-500 shadow-md" />
                  <div className="text-lg font-bold text-gray-700">Cử tri B</div>
                  <div className="text-sm text-gray-500 mb-2">Trần Thị B</div>
                  <div className="text-5xl font-black text-pink-600">
                    {voteResult.odd}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}

export const getStaticProps: GetStaticProps = async (context) => {
  const res = await fetch(
    "https://github.com/loiphan2202/zkb/blob/main/public/proving.key"
  );
  const arrayBuffer = await res.arrayBuffer();

  const proveKeyString = arrayBufferToBase64(arrayBuffer);

  const res2 = await fetch(
    "https://github.com/loiphan2202/zkb/blob/main/public/voteEvenOrOdd.zok"
  );

  const programString = await res2.text();

  return {
    props: {
      proveKeyString,
      programString,
    },
  };
};

export default Home;
